import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch
from uuid import uuid4

import httpx
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.processing import DocumentChunk
from app.models.study_materials import StudyMaterial
from app.schemas.study_materials import GenerateInput, MaterialContent, MaterialInput
from app.services.study_materials import generate_content, review_card, saved_content
from test_qa import QATests


def deck(source=None):
    return {"kind": "flashcards", "title": "Ôn tập", "content": {"cards": [
        {"front": "StudyFlow là gì?", "back": "Nền tảng học tập.", "source_ids": [str(source)] if source else []},
    ]}}


def mindmap():
    return {"kind": "mindmap", "title": "Kiến thức", "content": {"nodes": [
        {"id": "root", "label": "Học tập", "parent_id": None},
        {"id": "child", "label": "Ôn tập", "parent_id": "root"},
    ]}}


class MaterialValidationTests(unittest.TestCase):
    def test_review_schedule_advances_caps_and_resets_without_early_reviews(self):
        material = StudyMaterial(kind="flashcards", content=deck()["content"])
        db = Mock()
        now = datetime(2026, 11, 14, 2, tzinfo=timezone.utc)
        with patch("app.services.study_materials.get_material", return_value=material), \
                patch("app.services.study_materials.datetime") as clock:
            for step, days in enumerate((1, 2, 4, 8, 16, 30, 30), start=1):
                clock.now.return_value = now
                review_card(db, None, uuid4(), 0, True)
                card = material.content["cards"][0]
                self.assertEqual(card["review_streak"], min(step, 6))
                due = datetime.fromisoformat(card["next_review_at"])
                self.assertEqual(due, now + timedelta(days=days))
                self.assertEqual(datetime.fromisoformat(card["last_reviewed_at"]), now)
                with self.assertRaises(HTTPException) as raised:
                    review_card(db, None, uuid4(), 0, True)
                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(material.content["cards"][0], card)
                now = due
            clock.now.return_value = now
            review_card(db, None, uuid4(), 0, False)
            card = material.content["cards"][0]
            self.assertFalse(card["known"])
            self.assertEqual(card["review_streak"], 0)
            self.assertEqual(datetime.fromisoformat(card["next_review_at"]), now + timedelta(minutes=10))

    def test_saved_content_ignores_forged_schedule_and_preserves_unchanged_cards(self):
        content = MaterialContent.model_validate({"cards": [
            {"front": "First", "back": "Answer", "known": True, "review_streak": 6,
             "next_review_at": "2099-01-01T00:00:00Z"},
            {"front": "Second", "back": "Answer"},
        ]})
        created = saved_content(content)
        self.assertEqual(created["cards"][0]["review_streak"], 0)
        self.assertIsNone(created["cards"][0]["next_review_at"])
        previous = content.model_dump(mode="json")
        reordered = MaterialContent.model_validate({"cards": [content.cards[1].model_dump(), content.cards[0].model_dump()]})
        reordered.cards[1].review_streak = 0
        reordered.cards[1].next_review_at = None
        result = saved_content(reordered, previous)
        self.assertEqual(result["cards"][1]["review_streak"], 6)
        self.assertIsNotNone(result["cards"][1]["next_review_at"])
        reordered.cards[1].back = "Changed"
        result = saved_content(reordered, previous)
        self.assertFalse(result["cards"][1]["known"])
        self.assertIsNone(result["cards"][1]["next_review_at"])
        duplicate = MaterialContent(cards=[content.cards[0], content.cards[0]])
        result = saved_content(duplicate, {"cards": [previous["cards"][0]]})
        self.assertEqual([card["review_streak"] for card in result["cards"]], [6, 0])

    def test_generation_limits_match_saved_material_limits(self):
        self.assertEqual(GenerateInput(kind="flashcards", title="Deck", count=50).count, 50)
        self.assertEqual(GenerateInput(kind="mindmap", title="Map", count=30).count, 30)
        for kind, count in [("flashcards", 51), ("mindmap", 31), ("flashcards", 0)]:
            with self.assertRaises(ValidationError):
                GenerateInput(kind=kind, title="Test", count=count)

    def test_rejects_cycles_missing_parent_multiple_roots_and_duplicate_ids(self):
        for nodes in (
            [{"id": "a", "label": "A", "parent_id": "b"}, {"id": "b", "label": "B", "parent_id": "a"}, {"id": "root", "label": "Root"}],
            [{"id": "root", "label": "Root"}, {"id": "b", "label": "B", "parent_id": "missing"}],
            [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
            [{"id": "a", "label": "A"}, {"id": "a", "label": "B", "parent_id": "a"}],
        ):
            with self.assertRaises(ValidationError):
                MaterialInput(kind="mindmap", title="Map", content={"nodes": nodes})
        self.assertEqual(len(MaterialInput(**mindmap()).content.nodes), 2)
        with self.assertRaises(ValidationError):
            MaterialInput(kind="flashcards", title="Deck", content={"cards": [], "nodes": []})

    def test_generation_validates_sources_count_and_tree(self):
        chunk = DocumentChunk(id=uuid4(), content="StudyFlow là nền tảng học tập.", page_number=2)
        cases = [
            ("flashcards", {"cards": [{"front": "StudyFlow?", "back": "Học tập", "source_ids": [str(chunk.id)]}]}, None),
            ("flashcards", {"cards": [{"front": "StudyFlow?", "back": "Học tập", "source_ids": [str(uuid4())]}]}, 502),
            ("flashcards", {"cards": [{"front": "StudyFlow?", "back": "Học tập", "source_ids": []}]}, 502),
            ("flashcards", {"cards": []}, 422),
            ("mindmap", {"nodes": [{"id": "root", "label": "Học tập", "source_ids": [str(chunk.id)]}]}, None),
            ("mindmap", {"nodes": [{"id": "root", "parent_id": "root", "label": "Học tập", "source_ids": [str(chunk.id)]}]}, 502),
        ]
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")):
            for kind, payload, status in cases:
                response = {"finish_reason": "COMPLETE", "usage": {"tokens": {"input_tokens": 3, "output_tokens": 2}},
                    "message": {"content": [{"type": "text", "text": json.dumps(payload)}]}}
                with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=response))) as client:
                    if status:
                        with self.assertRaises(HTTPException) as raised:
                            generate_content(client, GenerateInput(kind=kind, title="Test", count=1), [chunk], {})
                        self.assertEqual(raised.exception.status_code, status)
                    else:
                        usage = {}
                        generate_content(client, GenerateInput(kind=kind, title="Test", count=1), [chunk], usage)
                        self.assertEqual(usage["total_tokens"], 5)
                        with self.assertRaises(HTTPException):
                            generate_content(client, GenerateInput(kind=kind, title="Test", count=2), [chunk], {})

    def test_provider_failures_do_not_expose_response_or_secrets(self):
        with patch.object(get_settings(), "cohere_api_key", SecretStr("private-key")):
            for status, payload, expected in [(429, {"message": "private-key"}, 429),
                    (400, {"message": "private-key"}, 502),
                    (401, {"message": "private-key"}, 503),
                    (403, {"message": "private-key"}, 503),
                    (404, {"message": "private-key"}, 502),
                    (500, {"message": "private-key"}, 503),
                    (200, {"finish_reason": "MAX_TOKENS"}, 502)]:
                with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, json=payload))) as client:
                    with self.assertRaises(HTTPException) as raised:
                        generate_content(client, GenerateInput(kind="flashcards", title="Deck"), [], {})
                    self.assertEqual(raised.exception.status_code, expected)
                    self.assertNotIn("private-key", raised.exception.detail)

    def test_generation_respects_model_output_limit_for_both_material_kinds(self):
        def handle(request):
            payload = json.loads(request.content)
            if payload["max_tokens"] > 4000:
                return httpx.Response(400, json={"message": "max_tokens exceeds model limit"})
            body = {"cards": []} if '"cards"' in payload["messages"][0]["content"] else {"nodes": []}
            return httpx.Response(200, json={"finish_reason": "COMPLETE", "message": {
                "content": [{"type": "text", "text": json.dumps(body)}]}})
        with patch.object(get_settings(), "cohere_api_key", SecretStr("test-only")), \
                httpx.Client(transport=httpx.MockTransport(handle)) as client:
            for kind in ("flashcards", "mindmap"):
                with self.assertRaises(HTTPException) as raised:
                    generate_content(client, GenerateInput(kind=kind, title="Test"), [], {})
                self.assertEqual(raised.exception.status_code, 422)


class MaterialTests(QATests):
    def test_review_schedule_persists_and_checks_access_origin_and_due_time(self):
        doc = self.upload(self.course()).json()
        material = self.client().post(f"/api/v1/documents/{doc['id']}/study-materials", json=deck()).json()
        url = f"/api/v1/study-materials/{material['id']}"
        now = datetime(2026, 11, 14, 2, tzinfo=timezone.utc)
        with patch("app.services.study_materials.datetime") as clock:
            clock.now.return_value = now
            response = self.client().patch(url + "/cards/0", json={"known": True})
            self.assertEqual(response.status_code, 200, response.text)
            card = response.json()["content"]["cards"][0]
            self.assertEqual(card["review_streak"], 1)
            self.assertEqual(datetime.fromisoformat(card["next_review_at"].replace("Z", "+00:00")), now + timedelta(days=1))
            self.assertEqual(self.client().patch(url + "/cards/0", json={"known": False}).status_code, 409)
            self.assertEqual(self.client("other").patch(url + "/cards/0", json={"known": True}).status_code, 404)
            self.assertEqual(self.client().patch(url + "/cards/0", json={"known": True}, headers={"Origin": "https://untrusted.example"}).status_code, 403)
            changed = deck()
            changed["title"] = "Đổi tên"
            updated = self.client().put(url, json=changed)
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(updated.json()["content"]["cards"][0], card)
            clock.now.return_value = now + timedelta(days=1)
            response = self.client().patch(url + "/cards/0", json={"known": False})
            self.assertEqual(response.status_code, 200, response.text)
            card = response.json()["content"]["cards"][0]
            self.assertEqual(card["review_streak"], 0)
            self.assertEqual(datetime.fromisoformat(card["next_review_at"].replace("Z", "+00:00")), now + timedelta(days=1, minutes=10))
        self.assertEqual(self.client().get(url).json()["content"]["cards"][0], card)

    def test_pdf_selection_creates_and_appends_flashcards_without_losing_progress(self):
        doc = self.upload(self.course()).json()
        base = f"/api/v1/documents/{doc['id']}/study-materials/from-selection"
        body = {"kind": "flashcards", "title": "Từ PDF", "label": "Tài liệu nói gì?",
                "selection": {"page_number": 1, "text": "StudyFlow test document"}}
        with patch("app.services.study_materials.generate_content") as generate:
            response = self.client().post(base, json=body)
            self.assertEqual(response.status_code, 201, response.text)
            material = response.json()
            self.assertEqual(material["content"]["cards"][0]["excerpt"], body["selection"])
            self.assertIsNone(material["generation_model"])
            url = f"/api/v1/study-materials/{material['id']}"
            self.client().patch(url + "/cards/0", json={"known": True})
            body["material_id"] = material["id"]
            appended = self.client().post(base, json=body)
            self.assertEqual(appended.status_code, 201, appended.text)
            cards = appended.json()["content"]["cards"]
            self.assertEqual(len(cards), 2)
            self.assertTrue(cards[0]["known"])
            self.assertFalse(cards[1]["known"])
            self.assertEqual(self.client("other").post(base, json=body).status_code, 404)
            generate.assert_not_called()

    def test_pdf_selection_mindmap_targets_branch_and_rejects_forged_quotes(self):
        doc = self.upload(self.course()).json()
        base = f"/api/v1/documents/{doc['id']}/study-materials/from-selection"
        body = {"kind": "mindmap", "title": "Từ PDF", "label": "Nhánh đã chọn",
                "selection": {"page_number": 1, "text": "StudyFlow test"}}
        created = self.client().post(base, json=body)
        self.assertEqual(created.status_code, 201, created.text)
        material = created.json()
        self.assertEqual(len(material["content"]["nodes"]), 2)
        body.update(material_id=material["id"], parent_id=material["content"]["nodes"][1]["id"])
        appended = self.client().post(base, json=body)
        self.assertEqual(appended.status_code, 201, appended.text)
        self.assertEqual(appended.json()["content"]["nodes"][-1]["parent_id"], body["parent_id"])
        body["parent_id"] = "unknown"
        self.assertEqual(self.client().post(base, json=body).status_code, 422)
        body.pop("parent_id"); body.pop("material_id")
        for selection in [{"page_number": 2, "text": "StudyFlow test"},
                          {"page_number": 1, "text": "fabricated source quote"},
                          {"page_number": 1, "text": "\u200b"}]:
            body["selection"] = selection
            self.assertEqual(self.client().post(base, json=body).status_code, 422)
        body["selection"] = {"page_number": 1, "text": "StudyFlow test"}
        self.assertEqual(self.client().post(base, json=body, headers={"Origin": "https://untrusted.example"}).status_code, 403)

    def test_pdf_selection_cannot_append_to_full_or_other_document_material(self):
        course = self.course()
        first, second = self.upload(course).json(), self.upload(course).json()
        data = deck()
        data["content"]["cards"] = [data["content"]["cards"][0]] * 50
        material = self.client().post(f"/api/v1/documents/{first['id']}/study-materials", json=data).json()
        body = {"kind": "flashcards", "label": "Câu hỏi", "material_id": material["id"],
                "selection": {"page_number": 1, "text": "StudyFlow test"}}
        self.assertEqual(self.client().post(f"/api/v1/documents/{first['id']}/study-materials/from-selection", json=body).status_code, 409)
        self.assertEqual(self.client().post(f"/api/v1/documents/{second['id']}/study-materials/from-selection", json=body).status_code, 404)
        forged = deck()
        forged["content"]["cards"][0]["excerpt"] = {"page_number": 1, "text": "forged"}
        self.assertEqual(self.client().post(f"/api/v1/documents/{first['id']}/study-materials", json=forged).status_code, 422)

    def test_large_generations_are_batched_and_mindmap_ids_are_merged(self):
        doc = self.ready()
        base = f"/api/v1/documents/{doc['id']}/study-materials/generate"
        for kind, total, expected_calls in [("flashcards", 50, 10), ("mindmap", 30, 6)]:
            counts = []
            def generate(client, data, chunks, usage, *, existing_labels):
                counts.append(data.count)
                self.assertLessEqual(data.count, 5)
                prefix = len(existing_labels)
                if kind == "flashcards":
                    return MaterialContent(cards=[{"front": f"Câu hỏi {prefix + i}", "back": "Trả lời", "source_ids": [chunks[0].id]} for i in range(data.count)])
                return MaterialContent(nodes=[{"id": f"n{i}", "parent_id": None if i == 0 else "n0",
                    "label": f"Chủ đề {prefix + i}", "source_ids": [chunks[0].id]} for i in range(data.count)])
            with patch("app.services.study_materials.generate_content", side_effect=generate):
                response = self.client().post(base, json={"kind": kind, "title": "Test", "count": total})
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(len(counts), expected_calls)
            output = response.json()["content"]
            self.assertEqual(len(output["cards"] if kind == "flashcards" else output["nodes"]), total)
            MaterialContent.model_validate(output).validate_kind(kind)
            if kind == "mindmap":
                self.assertEqual(sum(node["parent_id"] is None for node in output["nodes"]), 1)
                self.assertEqual(len({node["id"] for node in output["nodes"]}), total)

    def test_failed_later_batch_does_not_save_partial_material(self):
        doc = self.ready()
        calls = 0
        def generate(client, data, chunks, usage, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise HTTPException(429, "Hết hạn mức.")
            return MaterialContent(cards=[{"front": f"Câu {i}", "back": "Đáp án", "source_ids": [chunks[0].id]} for i in range(data.count)])
        with patch("app.services.study_materials.generate_content", side_effect=generate):
            response = self.client().post(f"/api/v1/documents/{doc['id']}/study-materials/generate", json={"kind": "flashcards", "title": "Deck", "count": 6})
        self.assertEqual(response.status_code, 429, response.text)
        self.assertIn("2/2", response.json()["detail"])
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(StudyMaterial)), 0)

    def test_classroom_material_is_private_and_revoked_with_membership(self):
        course, classroom = self.classroom()
        self.join(classroom)
        doc = self.upload(course, name="teacher", classroom_id=classroom).json()
        document_url = f"/api/v1/documents/{doc['id']}"
        self.assertEqual(self.client("teacher").patch(document_url, json={"published": True}).status_code, 200)
        base = document_url + "/study-materials"
        response = self.client().post(base, json=mindmap())
        self.assertEqual(response.status_code, 201, response.text)
        url = f"/api/v1/study-materials/{response.json()['id']}"
        self.assertEqual(self.client("teacher").get(url).status_code, 404)
        self.assertEqual(self.client("teacher").get(base, params={"kind": "mindmap"}).json(), [])
        self.client().delete(f"/api/v1/classrooms/{classroom}/members/me")
        self.assertEqual(self.client().get(url).status_code, 404)
        self.assertEqual(self.client().get(base, params={"kind": "mindmap"}).status_code, 404)
        self.assertEqual(self.client().put(url, json=mindmap()).status_code, 404)

    def test_material_crud_review_persistence_and_owner_scope(self):
        doc = self.ready()
        with Session(self.engine) as db:
            source = db.scalar(select(DocumentChunk.id))
        base = f"/api/v1/documents/{doc['id']}/study-materials"
        response = self.client().post(base, json=deck(source))
        self.assertEqual(response.status_code, 201, response.text)
        material = response.json()
        self.assertEqual(material["sources"][0]["page_number"], 1)
        url = f"/api/v1/study-materials/{material['id']}"
        self.assertEqual(self.client().get(base, params={"kind": "flashcards"}).json()[0]["id"], material["id"])
        self.assertEqual(self.client("other").get(url).status_code, 404)
        self.assertEqual(self.client("other").put(url, json=deck()).status_code, 404)
        self.assertEqual(self.client("other").delete(url).status_code, 404)
        self.assertEqual(self.client("admin").get(url).status_code, 403)
        self.assertEqual(self.client().patch(url + "/cards/0", json={"known": True}).status_code, 200)
        self.assertTrue(self.client().get(url).json()["content"]["cards"][0]["known"])
        self.assertEqual(self.client().patch(url + "/cards/-1", json={"known": True}).status_code, 404)
        changed = deck(source)
        changed["content"]["cards"][0]["back"] = "Nội dung đã sửa."
        self.assertEqual(self.client().put(url, json=changed).status_code, 200)
        self.assertFalse(self.client().get(url).json()["content"]["cards"][0]["known"])
        self.assertEqual(self.client().put(url, json=mindmap()).status_code, 422)
        self.assertEqual(self.client().delete(url).status_code, 200)
        self.assertEqual(self.client().get(url).status_code, 404)

    def test_mindmap_manual_creation_and_invalid_sources_origin(self):
        doc = self.upload(self.course()).json()
        base = f"/api/v1/documents/{doc['id']}/study-materials"
        response = self.client().post(base, json=mindmap())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()["content"]["nodes"]), 2)
        self.assertEqual(self.client().post(base, json=deck(uuid4())).status_code, 422)
        self.assertEqual(self.client().post(base, json=deck(), headers={"Origin": "https://untrusted.example"}).status_code, 403)
        self.assertEqual(self.client().post(base + "/generate", json={"kind": "mindmap", "title": "Map"}).status_code, 409)
        self.assertEqual(self.client().get(base, params={"kind": "mindmap"}).headers["cache-control"], "no-store")

    def test_generation_checks_access_before_ai_and_saves_sources(self):
        doc = self.ready()
        base = f"/api/v1/documents/{doc['id']}/study-materials/generate"
        with Session(self.engine) as db:
            source = db.scalar(select(DocumentChunk.id))
        content = MaterialContent.model_validate(deck(source)["content"])
        body = {"kind": "flashcards", "title": "Deck", "count": 1}
        with patch("app.services.study_materials.generate_content", return_value=content) as generate:
            self.assertEqual(self.client("other").post(base, json=body).status_code, 404)
            generate.assert_not_called()
            response = self.client().post(base, json=body)
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["sources"][0]["chunk_id"], str(source))
            self.assertEqual(response.json()["generation_model"], self.settings.cohere_quiz_model)
        self.client().delete(f"/api/v1/documents/{doc['id']}")
        self.assertEqual(self.client().get(f"/api/v1/study-materials/{response.json()['id']}").status_code, 404)
