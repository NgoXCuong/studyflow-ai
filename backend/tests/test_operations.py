import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.documents import Document
from app.models.processing import AIUsageLog, DocumentProcessingJob
from app.services.ai_usage import reported_tokens
from test_quizzes import QuizTests


class OperationsTests(QuizTests):
    def test_admin_only_and_read_only(self):
        for route in ("/admin/processing", "/admin/ai-usage"):
            for role in ("student", "teacher"):
                self.assertEqual(self.client(role).get("/api/v1" + route).status_code, 403)
            client = self.client("admin")
            result = client.get("/api/v1" + route)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.headers["cache-control"], "no-store")
            self.assertEqual(result.json()["total"], 0)
            self.assertEqual(client.post("/api/v1" + route, json={}).status_code, 405)
            self.assertEqual(client.get("/api/v1" + route + "?limit=0").status_code, 422)

    def test_processing_filters_removed_and_no_private_fields(self):
        doc = self.upload(self.course()).json()
        with Session(self.engine) as db, db.begin():
            db.get(Document, doc["id"]).status = "failed"
            job = db.get(DocumentProcessingJob, doc["id"])
            if job is None:
                job = DocumentProcessingJob(document_id=doc["id"])
                db.add(job)
            job.attempt_count = 2
            job.error_code = "cohere_http_429"
            job.error_message = "private prompt and test-secret"
        client = self.client("admin")
        result = client.get("/api/v1/admin/processing?status=failed").json()
        self.assertEqual((result["total"], result["counts"]["failed"], result["items"][0]["attempt_count"]), (1, 1, 2))
        self.assertNotIn("test-secret", str(result))
        for field in ("title", "original_filename", "storage_key", "error_message", "claim_token"):
            self.assertNotIn(field, result["items"][0])
        page = client.get("/api/v1/admin/processing?limit=1&offset=1").json()
        self.assertEqual((page["total"], page["items"]), (1, []))
        self.assertEqual(client.get(f"/api/v1/admin/processing?owner_id={self.ids['other']}").json()["total"], 0)
        self.assertEqual(client.get(f"/api/v1/admin/processing?document_id={doc['id']}").json()["total"], 1)
        self.client().delete(f"/api/v1/documents/{doc['id']}")
        self.assertEqual(client.get("/api/v1/admin/processing").json()["total"], 0)
        result = client.get("/api/v1/admin/processing?include_removed=true").json()
        self.assertTrue(result["items"][0]["source_removed"])
        self.assertEqual(client.get("/api/v1/admin/processing?status=invalid").status_code, 422)

    def test_usage_summary_filters_partial_tokens_and_pagination(self):
        doc = self.upload(self.course()).json()
        with Session(self.engine) as db, db.begin():
            for operation, status, tokens, duration in (("qa_generation", "success", 30, 100), ("quiz_generation", "failed", None, 200)):
                db.add(AIUsageLog(document_id=doc["id"], owner_id=self.ids["student"], provider="cohere", model="test-model",
                    operation=operation, status=status, total_tokens=tokens, duration_ms=duration, input_characters=10, chunk_count=1,
                    created_at=datetime(2040, 1, 1, tzinfo=timezone.utc)))
        client = self.client("admin")
        result = client.get("/api/v1/admin/ai-usage?limit=1").json()
        self.assertEqual((result["total"], result["success_count"], result["failed_count"], len(result["items"])), (2, 1, 1, 1))
        self.assertEqual((result["recorded_tokens"], result["token_recorded_count"], result["average_duration_ms"]), (30, 1, 150))
        self.assertEqual(result["operations"], {"qa_generation": 1, "quiz_generation": 1})
        result = client.get("/api/v1/admin/ai-usage?status=failed&provider=cohere&model=test-model").json()
        self.assertIsNone(result["recorded_tokens"])
        self.assertEqual(result["token_recorded_count"], 0)
        self.assertEqual(client.get("/api/v1/admin/ai-usage?created_from=2040-01-01T00:00:00Z&created_to=2040-01-02T00:00:00Z").json()["total"], 2)
        self.assertEqual(client.get("/api/v1/admin/ai-usage?created_to=2040-01-01T00:00:00Z").json()["total"], 0)
        self.assertEqual(client.get("/api/v1/admin/ai-usage?created_from=2040-01-02T00:00:00Z&created_to=2040-01-01T00:00:00Z").status_code, 422)
        self.assertEqual(client.get("/api/v1/admin/ai-usage?created_from=2040-01-01T00:00:00").status_code, 422)
        self.assertEqual(client.get("/api/v1/admin/ai-usage?operation=bad").status_code, 422)
        self.assertEqual(client.get(f"/api/v1/admin/ai-usage?owner_id={self.ids['other']}").json()["total"], 0)

    def test_qa_and_quiz_call_metadata_persist_on_failure_and_no_content(self):
        doc = self.ready()
        with patch.object(self.settings, "cohere_api_key", SecretStr("test-only")), \
                patch("app.services.qa.embed_batch", return_value=([[1.] + [0.] * 767], 4)), \
                patch("app.services.qa.generate_answer", side_effect=HTTPException(503, "private question secret")):
            response = self.client().post(f"/api/v1/documents/{doc['id']}/ask", json={"question": "private question secret"})
        self.assertEqual(response.status_code, 503, response.text)
        with Session(self.engine) as db:
            logs = list(db.scalars(select(AIUsageLog).order_by(AIUsageLog.created_at)))
            self.assertEqual([(log.operation, log.status) for log in logs], [("document_embedding", "success"), ("question_embedding", "success"), ("qa_generation", "failed")])
            self.assertEqual(logs[1].total_tokens, 4)
            self.assertEqual(logs[2].error_code, "api_http_503")
        with patch("app.services.quizzes.generate_questions", side_effect=HTTPException(502, "private quiz secret")):
            response = self.client().post(f"/api/v1/documents/{doc['id']}/quizzes", json={"title": "Private quiz secret", "question_count": 1})
        self.assertEqual(response.status_code, 502, response.text)
        result = self.client("admin").get("/api/v1/admin/ai-usage").json()
        self.assertEqual((result["total"], result["failed_count"]), (4, 2))
        self.assertNotIn("private", str(result).lower())
        self.assertNotIn("secret", str(result).lower())


class UsageMetadataTests(unittest.TestCase):
    def test_reported_tokens_validate_types_and_missing_values(self):
        self.assertEqual(reported_tokens({"usage": {"tokens": {"input_tokens": 10, "output_tokens": 2}}}), 12)
        self.assertEqual(reported_tokens({"usage": {"billed_units": {"input_tokens": 0, "output_tokens": 0}}}), 0)
        for value in ({}, {"usage": None}, {"usage": {"tokens": {"input_tokens": True, "output_tokens": 2}}}, {"usage": {"tokens": {"input_tokens": -1, "output_tokens": 2}}}):
            self.assertIsNone(reported_tokens(value))


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([loader.loadTestsFromTestCase(UsageMetadataTests),
        unittest.TestSuite(OperationsTests(name) for name in loader.getTestCaseNames(OperationsTests) if name in OperationsTests.__dict__)])
