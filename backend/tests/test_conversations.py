import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.conversations import Conversation, ConversationTurn
from app.schemas.qa import AnswerOutput
from test_qa import QATests


class ConversationTests(QATests):
    def create_chat(self):
        doc = self.ready()
        url = f"/api/v1/documents/{doc['id']}/conversations"
        result = self.client().post(url, json={"title": "Học chương 1"})
        self.assertEqual(result.status_code, 201, result.text)
        return doc, result.json(), url

    def test_create_rename_private_list_delete_cascades(self):
        doc, chat, url = self.create_chat()
        path = f"/api/v1/conversations/{chat['id']}"
        self.assertEqual(self.client().get(url).json()[0]["id"], chat["id"])
        self.assertEqual(self.client("other").get(path + "/turns").status_code, 404)
        self.assertEqual(self.client("other").patch(path, json={"title": "stolen"}).status_code, 404)
        self.assertEqual(self.client("other").delete(path).status_code, 404)
        self.assertEqual(self.client().patch(path, json={"title": "  Tên mới  "}).json()["title"], "Tên mới")
        with patch("app.services.conversations.answer_question", return_value=AnswerOutput(answer="Thiếu căn cứ", insufficient_evidence=True)):
            self.assertEqual(self.client().post(path + "/turns", json={"question": "test"}).status_code, 201)
        self.assertEqual(self.client().delete(path).status_code, 200)
        self.assertEqual(self.client().get(path + "/turns").status_code, 404)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(ConversationTurn)), 0)

    def test_followup_uses_saved_history_and_failed_turn_is_not_saved(self):
        doc, chat, _ = self.create_chat()
        url = f"/api/v1/conversations/{chat['id']}/turns"
        answer = AnswerOutput(answer="Nội dung đã trả lời", insufficient_evidence=True)
        with patch("app.services.conversations.answer_question", return_value=answer) as generate:
            first = self.client().post(url, json={"question": "Khái niệm là gì?"})
            self.assertEqual(first.status_code, 201, first.text)
            self.client().post(url, json={"question": "Giải thích thêm điều đó"})
            self.assertEqual(generate.call_args.kwargs["history"], [{"question": "Khái niệm là gì?", "answer": answer.answer}])
        response = self.client().get(url)
        self.assertEqual(response.headers["cache-control"], "no-store")
        saved = response.json()
        self.assertEqual(len(saved), 2)
        self.assertEqual(saved[0]["question"], "Giải thích thêm điều đó")
        self.assertEqual(len(self.client().get(url + "?limit=1&offset=1").json()), 1)
        with patch("app.services.conversations.answer_question", side_effect=HTTPException(503, "AI unavailable")):
            self.assertEqual(self.client().post(url, json={"question": "Thử lại"}).status_code, 503)
        self.assertEqual(len(self.client().get(url).json()), 2)

    def test_revoked_document_access_hides_history(self):
        doc, chat, url = self.create_chat()
        path = f"/api/v1/conversations/{chat['id']}"
        self.client().delete(f"/api/v1/documents/{doc['id']}")
        self.assertEqual(self.client().get(url).status_code, 404)
        self.assertEqual(self.client().get(path + "/turns").status_code, 404)
        with patch("app.services.conversations.answer_question") as generate:
            self.assertEqual(self.client().post(path + "/turns", json={"question": "test"}).status_code, 404)
            generate.assert_not_called()

    def test_locked_conversation_and_input_validation(self):
        _, chat, url = self.create_chat()
        path = f"/api/v1/conversations/{chat['id']}"
        with Session(self.engine) as db, db.begin():
            db.scalar(select(Conversation).where(Conversation.id == chat["id"]).with_for_update())
            self.assertEqual(self.client().post(path + "/turns", json={"question": "test"}).status_code, 409)
        self.assertEqual(self.client().post(url, json={"title": " "}).status_code, 422)
        self.assertEqual(self.client().post(path + "/turns", json={"question": " "}).status_code, 422)
        self.assertEqual(self.client().delete(path, headers={"Origin": "https://other.invalid"}).status_code, 403)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(ConversationTests(name) for name in loader.getTestCaseNames(ConversationTests)
                              if name in ConversationTests.__dict__)
