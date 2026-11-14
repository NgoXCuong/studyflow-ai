import json
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

import test_documents
from app.core.config import get_settings
from app.models.processing import DocumentChunk
from app.services.document_processing import process_once
from app.services.embeddings import embed_batch
from app.services.qa import generate_answer


class ProviderTests(unittest.TestCase):
    def test_query_embedding_uses_search_query(self):
        def handle(request):
            self.assertEqual(json.loads(request.content)["input_type"], "search_query")
            return httpx.Response(200, json={"embeddings": {"float": [[1.0] * 768]}})
        with patch.object(get_settings(), "embedding_provider", "cohere"), \
                patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")), \
                httpx.Client(transport=httpx.MockTransport(handle)) as client:
            embed_batch(client, ["question"], "", query=True)

    def test_generation_rejects_fabricated_sources_and_truncated_answers(self):
        chunk = DocumentChunk(id=uuid4(), content="Nội dung nguồn", page_number=2)
        for finish, ids in (("COMPLETE", [str(uuid4())]), ("MAX_TOKENS", [str(chunk.id)])):
            data = {"finish_reason": finish, "message": {"content": [{"type": "text", "text": json.dumps({
                "answer": "Câu trả lời", "source_ids": ids,
            })}]}}
            with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=data))) as client:
                with self.assertRaises(HTTPException) as raised:
                    generate_answer(client, "question", [chunk])
                self.assertEqual(raised.exception.status_code, 502)

    def test_generation_parses_only_valid_sources(self):
        chunk = DocumentChunk(id=uuid4(), content="Nội dung nguồn", page_number=2)
        def handle(request):
            payload = json.loads(request.content)
            self.assertEqual(json.loads(payload["messages"][1]["content"])["sources"][0]["id"], str(chunk.id))
            return httpx.Response(200, json={"usage": {"tokens": {"input_tokens": 3, "output_tokens": 2}}, "finish_reason": "COMPLETE", "message": {"content": [
                {"type": "text", "text": json.dumps({"answer": "Có căn cứ", "source_ids": [str(chunk.id)]})},
            ]}})
        with httpx.Client(transport=httpx.MockTransport(handle)) as client:
            usage = {}
            self.assertEqual(generate_answer(client, "question", [chunk], usage=usage), ("Có căn cứ", [str(chunk.id)]))
            self.assertEqual(usage["total_tokens"], 5)


class QATests(test_documents.DocumentTests):
    def ready(self):
        doc = self.upload(self.course()).json()
        with patch.object(self.settings, "cohere_api_key", SecretStr("test-only")), \
                patch.object(self.settings, "embedding_provider", "cohere"), \
                patch("app.services.document_processing.embed_batch", return_value=([[1.] + [0.] * 767], 8)):
            process_once(self.engine)
        return doc

    def test_answer_has_real_page_and_access_is_checked_before_ai(self):
        doc = self.ready()
        with Session(self.engine) as db:
            chunk = db.scalar(select(DocumentChunk))
            chunk_id = str(chunk.id)
        url = f"/api/v1/documents/{doc['id']}/ask"
        with patch.object(self.settings, "cohere_api_key", SecretStr("test-only")), \
                patch("app.services.qa.embed_batch", return_value=([[1.] + [0.] * 767], 4)) as embed, \
                patch("app.services.qa.generate_answer", return_value=("Nội dung", [chunk_id])):
            self.assertEqual(self.client("other").post(url, json={"question": "test"}).status_code, 404)
            embed.assert_not_called()
            result = self.client().post(url, json={"question": "test"})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["sources"][0]["page_number"], 1)
            self.assertEqual(result.json()["sources"][0]["document_id"], doc["id"])

    def test_not_ready_invalid_input_origin_and_model_mismatch(self):
        doc = self.upload(self.course()).json()
        url = f"/api/v1/documents/{doc['id']}/ask"
        self.assertEqual(self.client().post(url, json={"question": "test"}).status_code, 409)
        for question in ("  ", "x" * 2001):
            self.assertEqual(self.client().post(url, json={"question": question}).status_code, 422)
        self.assertEqual(self.client().post(url, json={"question": "test"}, headers={"Origin": "https://other.invalid"}).status_code, 403)
        doc = self.ready()
        with Session(self.engine) as db, db.begin():
            db.scalar(select(DocumentChunk)).embedding_model = "gemini-embedding-001"
        with patch("app.services.qa.embed_batch") as embed:
            self.assertEqual(self.client().post(f"/api/v1/documents/{doc['id']}/ask", json={"question": "test"}).status_code, 409)
            embed.assert_not_called()

    def test_insufficient_evidence_returns_no_sources(self):
        doc = self.ready()
        with patch.object(self.settings, "cohere_api_key", SecretStr("test-only")), \
                patch("app.services.qa.embed_batch", return_value=([[1.] + [0.] * 767], 4)), \
                patch("app.services.qa.generate_answer", return_value=("", [])):
            result = self.client().post(f"/api/v1/documents/{doc['id']}/ask", json={"question": "unrelated"})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["insufficient_evidence"])
        self.assertEqual(result.json()["sources"], [])

    def test_unpublished_class_document_never_calls_ai(self):
        course, classroom = self.classroom()
        self.join(classroom)
        doc = self.upload(course, name="teacher", classroom_id=classroom).json()
        with patch("app.services.qa.embed_batch") as embed:
            result = self.client().post(f"/api/v1/documents/{doc['id']}/ask", json={"question": "test"})
            self.assertEqual(result.status_code, 404)
            embed.assert_not_called()

    def test_deleted_document_during_generation_returns_no_answer(self):
        doc = self.ready()
        def delete_source(client, question, chunks, history=None, usage=None):
            self.client().delete(f"/api/v1/documents/{doc['id']}")
            return "Nội dung", [str(chunks[0].id)]
        with patch.object(self.settings, "cohere_api_key", SecretStr("test-only")), \
                patch("app.services.qa.embed_batch", return_value=([[1.] + [0.] * 767], 4)), \
                patch("app.services.qa.generate_answer", side_effect=delete_source):
            result = self.client().post(f"/api/v1/documents/{doc['id']}/ask", json={"question": "test"})
        self.assertEqual(result.status_code, 404)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([
        loader.loadTestsFromTestCase(ProviderTests),
        unittest.TestSuite(QATests(name) for name in loader.getTestCaseNames(QATests) if name in QATests.__dict__),
    ])
