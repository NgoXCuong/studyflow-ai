import json
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.processing import DocumentChunk
from app.models.quizzes import Quiz, QuizQuestion
from app.schemas.quizzes import GeneratedQuiz, QuestionInput, QuizGenerateInput
from app.services.quizzes import generate_questions
from test_qa import QATests


def question(source_id):
    return {"question": "StudyFlow hỗ trợ việc gì?", "choices": ["Học tập", "Nấu ăn", "Lái xe", "Du lịch"],
            "correct_index": 0, "explanation": "Nguồn mô tả nền tảng học tập.", "topic": "Học tập", "source_ids": [str(source_id)]}


class GenerationTests(unittest.TestCase):
    def test_read_timeout_is_distinct_from_connection_failure(self):
        for exception, status in ((httpx.ReadTimeout, 504), (httpx.ConnectTimeout, 503), (httpx.ConnectError, 503)):
            calls = []
            def handle(request):
                calls.append(request)
                raise exception("private test-secret", request=request)
            with patch.object(get_settings(), "cohere_api_key", SecretStr("test-secret")), \
                    httpx.Client(transport=httpx.MockTransport(handle)) as client:
                with self.assertRaises(HTTPException) as raised:
                    generate_questions(client, QuizGenerateInput(title="Quiz", question_count=2), [])
                self.assertEqual(raised.exception.status_code, status)
                self.assertNotIn("test-secret", str(raised.exception.detail))
                self.assertEqual(len(calls), 1)

    def test_generation_validates_request_response_and_sources(self):
        chunk = DocumentChunk(id=uuid4(), page_number=1, content="StudyFlow hỗ trợ học tập.")
        data = QuizGenerateInput(title="Quiz", question_count=1)
        q = question(chunk.id)
        def handle(request):
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], get_settings().cohere_quiz_model)
            self.assertEqual(payload["max_tokens"], 1200)
            schema = payload["response_format"]["schema"]
            self.assertEqual(schema["required"], ["questions"])
            item = schema["properties"]["questions"]["items"]
            self.assertEqual(set(item["required"]), set(q))
            self.assertFalse(item["additionalProperties"])
            self.assertEqual(item["properties"]["correct_index"]["enum"], [0, 1, 2, 3])
            self.assertEqual(item["properties"]["source_ids"]["items"]["enum"], [str(chunk.id)])
            self.assertEqual(json.loads(payload["messages"][1]["content"])["question_count"], 1)
            return httpx.Response(200, json={"finish_reason": "COMPLETE", "message": {"content": [
                {"type": "text", "text": json.dumps({"questions": [q]})}]}})
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")), httpx.Client(transport=httpx.MockTransport(handle)) as client:
            self.assertEqual(len(generate_questions(client, data, [chunk]).questions), 1)
            for field, value in (("correct_index", True), ("correct_index", 4), ("choices", ["A"] * 4),
                                 ("source_ids", [str(uuid4())]), ("explanation", " ")):
                original = q[field]
                q[field] = value
                with self.assertRaises(HTTPException) as raised:
                    generate_questions(client, data, [chunk])
                self.assertEqual(raised.exception.status_code, 502)
                q[field] = original

    def test_upstream_failure_and_insufficient_evidence(self):
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-secret")):
            for status, body, expected in ((429, {"message": "test-secret private"}, 503),
                    (200, {"finish_reason": "MAX_TOKENS"}, 502),
                    (200, {"finish_reason": "COMPLETE", "message": {"content": [{"type": "text", "text": '{"questions": []}'}]}}, 422)):
                with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, json=body))) as client:
                    with self.assertRaises(HTTPException) as raised:
                        generate_questions(client, QuizGenerateInput(title="Quiz", question_count=1), [])
                    self.assertEqual(raised.exception.status_code, expected)
                    self.assertNotIn("test-secret", str(raised.exception.detail))

    def test_truncated_response_has_actionable_error(self):
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")), \
                httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
                    "finish_reason": "MAX_TOKENS", "message": {"content": [{"type": "text", "text": "private partial"}]},
                }))) as client:
            with self.assertRaises(HTTPException) as raised:
                generate_questions(client, QuizGenerateInput(title="Quiz"), [])
            self.assertEqual(raised.exception.status_code, 502)
            self.assertIn("giới hạn độ dài", raised.exception.detail)
            self.assertNotIn("private", raised.exception.detail)

    def test_validation_logging_excludes_content(self):
        chunk = DocumentChunk(id=uuid4(), page_number=1, content="private-source")
        q = question(chunk.id)
        q["choices"] = ["private-choice"] * 4
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")), \
                httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
                    "finish_reason": "COMPLETE", "message": {"content": [{"type": "text", "text": json.dumps({"questions": [q]})}]},
                }))) as client, self.assertLogs("app.services.quizzes", level="WARNING") as captured:
            with self.assertRaises(HTTPException):
                generate_questions(client, QuizGenerateInput(title="Quiz", question_count=1), [chunk])
        self.assertIn("choices", str(captured.output))
        self.assertNotIn("private", str(captured.output))


class QuizTests(QATests):
    def generate(self):
        doc = self.ready()
        with Session(self.engine) as db:
            chunk_id = db.scalar(select(DocumentChunk.id))
        q = question(chunk_id)
        with patch("app.services.quizzes.generate_questions", return_value=GeneratedQuiz(questions=[QuestionInput(**q)])):
            response = self.client().post(f"/api/v1/documents/{doc['id']}/quizzes", json={"title": "Quiz kiểm thử", "question_count": 1})
        self.assertEqual(response.status_code, 201, response.text)
        return doc, response.json(), q

    def test_draft_crud_and_answers_are_owner_only(self):
        doc, quiz, q = self.generate()
        url = f"/api/v1/quizzes/{quiz['id']}"
        self.assertEqual((quiz["status"], quiz["ai_generated"]), ("draft", True))
        self.assertEqual(quiz["generation_model"], get_settings().cohere_quiz_model)
        self.assertEqual(quiz["questions"][0]["sources"][0]["page_number"], 1)
        self.assertEqual(self.client("other").get(url).status_code, 404)
        self.assertEqual(self.client("admin").get(url).status_code, 403)
        self.assertEqual(self.client().get(url).headers["cache-control"], "no-store")
        self.assertEqual(self.client().get(f"/api/v1/documents/{doc['id']}/quizzes").json()[0]["id"], quiz["id"])
        self.assertEqual(self.client().patch(url, json={"title": "Tên mới"}).json()["title"], "Tên mới")
        q["question"] = "Nền tảng phục vụ mục đích nào?"
        result = self.client().put(url + f"/questions/{quiz['questions'][0]['id']}", json=q)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["question"], q["question"])
        self.assertEqual(self.client().delete(url).status_code, 200)
        self.assertEqual(self.client().get(url).status_code, 404)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(QuizQuestion)), 0)

    def test_input_permissions_and_not_ready_never_call_ai(self):
        doc = self.upload(self.course()).json()
        url = f"/api/v1/documents/{doc['id']}/quizzes"
        with patch("app.services.quizzes.generate_questions") as generate:
            self.assertEqual(self.client().post(url, json={"title": "Quiz"}).status_code, 409)
            self.assertEqual(self.client("other").post(url, json={"title": "Quiz"}).status_code, 404)
            self.assertEqual(self.client().post(url, json={"title": "Quiz", "question_count": 11}).status_code, 422)
            self.assertEqual(self.client().post(url, json={"title": "Quiz", "question_count": True}).status_code, 422)
            self.assertEqual(self.client().post(url, json={"title": "Quiz"}, headers={"Origin": "https://other.invalid"}).status_code, 403)
            generate.assert_not_called()

    def test_invalid_source_and_revoked_access(self):
        doc, quiz, q = self.generate()
        url = f"/api/v1/quizzes/{quiz['id']}"
        q["source_ids"] = [str(uuid4())]
        self.assertEqual(self.client().put(url + f"/questions/{quiz['questions'][0]['id']}", json=q).status_code, 422)
        self.assertEqual(self.client().get(url).json()["questions"][0]["question"], quiz["questions"][0]["question"])
        self.client().delete(f"/api/v1/documents/{doc['id']}")
        self.assertEqual(self.client().get(url).status_code, 404)

    def test_ai_failure_or_deletion_does_not_save_quiz(self):
        doc = self.ready()
        url = f"/api/v1/documents/{doc['id']}/quizzes"
        with patch("app.services.quizzes.generate_questions", side_effect=HTTPException(503, "AI unavailable")):
            self.assertEqual(self.client().post(url, json={"title": "Quiz"}).status_code, 503)
        def delete_during_generation(client, data, chunks):
            self.client().delete(f"/api/v1/documents/{doc['id']}")
            return GeneratedQuiz(questions=[QuestionInput(**question(chunks[0].id))])
        with patch("app.services.quizzes.generate_questions", side_effect=delete_during_generation):
            self.assertEqual(self.client().post(url, json={"title": "Quiz", "question_count": 1}).status_code, 404)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(Quiz)), 0)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([loader.loadTestsFromTestCase(GenerationTests),
        unittest.TestSuite(QuizTests(name) for name in loader.getTestCaseNames(QuizTests) if name in QuizTests.__dict__)])
