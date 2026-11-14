import unittest
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models.attempts import AttemptAnswer, QuizAttempt
from app.models.auth import User
from app.models.quizzes import Quiz, QuizQuestion
from app.schemas.attempts import AttemptStartInput
from app.services.attempts import start_attempt, submit_attempt
from test_quizzes import QuizTests


class AttemptTests(QuizTests):
    def prepared(self, classroom=False):
        if classroom:
            class_id, doc, quiz, _ = self.class_quiz()
            self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": True})
            owner = self.client("teacher")
        else:
            doc, quiz, _ = self.generate()
            class_id, owner = None, self.client()
        with Session(self.engine) as db, db.begin():
            original = db.get(QuizQuestion, quiz["questions"][0]["id"])
            for position in (1, 2):
                db.add(QuizQuestion(quiz_id=quiz["id"], position=position, question=f"Câu hỏi {position + 1}",
                    choices=original.choices, correct_index=0, explanation=original.explanation,
                    topic=original.topic, sources=original.sources))
        result = owner.post(f"/api/v1/quizzes/{quiz['id']}/publish")
        self.assertEqual(result.status_code, 200, result.text)
        return class_id, owner.get(f"/api/v1/quizzes/{quiz['id']}").json()

    def start(self, quiz, **body):
        response = self.client().post(f"/api/v1/quizzes/{quiz['id']}/attempts", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_start_resume_save_and_no_answer_leaks(self):
        _, quiz = self.prepared()
        attempt = self.start(quiz, purpose="diagnostic")
        url = f"/api/v1/attempts/{attempt['id']}"
        self.assertEqual(attempt["question_count"], 3)
        self.assertIsNone(attempt["score"])
        self.assertEqual(self.start(quiz, purpose="diagnostic")["id"], attempt["id"])
        for q in attempt["questions"]:
            for field in ("correct_index", "explanation", "sources", "is_correct"):
                self.assertNotIn(field, q)
            self.assertIsNone(q["selected_index"])
        question_id = attempt["questions"][0]["id"]
        result = self.client().put(url + f"/answers/{question_id}", json={"selected_index": 2})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["answered_count"], 1)
        saved = self.client().get(url)
        self.assertEqual(saved.json()["questions"][0]["selected_index"], 2)
        self.assertNotIn("correct_index", saved.text)
        self.assertEqual(saved.headers["cache-control"], "no-store")
        self.client().put(url + f"/answers/{question_id}", json={"selected_index": None})
        self.assertEqual(self.client().get(url).json()["answered_count"], 0)
        history = self.client().get(f"/api/v1/quizzes/{quiz['id']}/attempts/me").json()
        self.assertEqual(history[0]["purpose"], "diagnostic")
        self.assertNotIn("questions", history[0])
        self.assertEqual(self.client().post(f"/api/v1/quizzes/{quiz['id']}/attempts", json={}).status_code, 409)

    def test_grading_blanks_rounding_idempotency_and_frozen_history(self):
        _, quiz = self.prepared()
        attempt = self.start(quiz)
        url = f"/api/v1/attempts/{attempt['id']}"
        for q, selected in zip(attempt["questions"], (0, 1)):
            self.client().put(url + f"/answers/{q['id']}", json={"selected_index": selected})
        response = self.client().post(url + "/submit", json={"score": 10, "correct_count": 3})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual((result["score"], result["correct_count"], result["answered_count"]), (3.33, 1, 2))
        self.assertEqual([q["is_correct"] for q in result["questions"]], [True, False, False])
        self.assertTrue(all("correct_index" in q and "sources" in q for q in result["questions"]))
        self.assertEqual(self.client().post(url + "/submit").json(), result)
        self.assertEqual(self.client().put(url + f"/answers/{attempt['questions'][0]['id']}", json={"selected_index": 1}).status_code, 409)
        self.assertEqual(self.client().get(url).json(), result)
        for statement in ("UPDATE quiz_attempts SET status = 'in_progress', submitted_at = NULL WHERE id = :id",
                          "DELETE FROM quiz_attempts WHERE id = :id",
                          "UPDATE attempt_answers SET selected_index = 0 WHERE attempt_id = :id",
                          "DELETE FROM attempt_answers WHERE attempt_id = :id"):
            with self.subTest(statement=statement), self.assertRaises(DBAPIError), self.engine.begin() as db:
                db.execute(text(statement), {"id": attempt["id"]})

    def test_retry_wrong_questions_and_full_attempts_remain_separate(self):
        _, quiz = self.prepared()
        first = self.start(quiz)
        self.client().put(f"/api/v1/attempts/{first['id']}/answers/{first['questions'][0]['id']}", json={"selected_index": 0})
        self.client().post(f"/api/v1/attempts/{first['id']}/submit")
        wrong = self.start(quiz, scope="wrong_only", source_attempt_id=first["id"])
        self.assertEqual(wrong["question_count"], 2)
        self.assertNotIn(first["questions"][0]["id"], [q["id"] for q in wrong["questions"]])
        for q in wrong["questions"]:
            self.client().put(f"/api/v1/attempts/{wrong['id']}/answers/{q['id']}", json={"selected_index": 0})
        self.assertEqual(self.client().post(f"/api/v1/attempts/{wrong['id']}/submit").json()["score"], 10)
        response = self.client().post(f"/api/v1/quizzes/{quiz['id']}/attempts", json={"scope": "wrong_only", "source_attempt_id": wrong["id"]})
        self.assertEqual(response.status_code, 409)
        retry = self.start(quiz, source_attempt_id=first["id"])
        self.assertEqual(retry["question_count"], 3)
        self.client().post(f"/api/v1/attempts/{retry['id']}/submit")
        history = self.client().get(f"/api/v1/quizzes/{quiz['id']}/attempts/me?limit=2&offset=1").json()
        self.assertEqual(len(history), 2)
        self.assertEqual(self.client().get(f"/api/v1/attempts/{first['id']}").json()["score"], 3.33)

    def test_input_security_draft_and_foreign_questions(self):
        _, quiz, _ = self.generate()
        start = f"/api/v1/quizzes/{quiz['id']}/attempts"
        self.assertEqual(self.client().post(start, json={}).status_code, 404)
        self.client().post(f"/api/v1/quizzes/{quiz['id']}/publish")
        attempt = self.start(quiz)
        url = f"/api/v1/attempts/{attempt['id']}"
        answer = url + f"/answers/{quiz['questions'][0]['id']}"
        for data in ({"selected_index": True}, {"selected_index": 4}, {"selected_index": 0, "is_correct": True}):
            self.assertEqual(self.client().put(answer, json=data).status_code, 422)
        self.assertEqual(self.client().put(url + f"/answers/{uuid4()}", json={"selected_index": 0}).status_code, 404)
        self.assertEqual(self.client("other").get(url).status_code, 404)
        self.assertEqual(self.client("other").put(answer, json={"selected_index": 0}).status_code, 404)
        self.assertEqual(self.client("other").post(url + "/submit").status_code, 404)
        self.assertEqual(self.client("other").post(start, json={}).status_code, 404)
        self.assertEqual(self.client("teacher").post(start, json={}).status_code, 403)
        self.assertEqual(self.client("admin").get(url).status_code, 403)
        self.assertEqual(self.client().post(url + "/submit", headers={"Origin": "https://other.invalid"}).status_code, 403)
        self.assertEqual(self.client().post(start, json={"scope": "wrong_only"}).status_code, 422)
        with Session(self.engine) as db, db.begin():
            db.execute(text("UPDATE attempt_answers SET is_correct = true WHERE attempt_id = :id"), {"id": attempt["id"]})
            self.assertIsNone(db.get(AttemptAnswer, (attempt["id"], quiz["questions"][0]["id"])).is_correct)
        self.client().post(url + "/submit")
        self.assertEqual(self.client().post(start, json={"source_attempt_id": str(uuid4())}).status_code, 404)

    def test_classroom_teacher_results_and_revoked_membership(self):
        classroom, quiz = self.prepared(classroom=True)
        quiz_url = f"/api/v1/quizzes/{quiz['id']}"
        self.assertEqual(self.client("teacher").get(quiz_url + "/statistics").json()["average_score"], None)
        self.assertEqual(self.client("teacher").get(quiz_url + "/results").json(), [])
        attempt = self.start(quiz)
        url = f"/api/v1/attempts/{attempt['id']}"
        self.assertEqual(self.client("teacher").get(url).status_code, 404)
        self.client().post(url + "/submit")
        result = self.client("teacher").get(quiz_url + "/results")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()[0]["student_id"], str(self.ids["student"]))
        self.assertEqual(self.client("teacher").get(url).status_code, 200)
        stats = self.client("teacher").get(quiz_url + "/statistics")
        self.assertEqual(stats.status_code, 200, stats.text)
        self.assertEqual((stats.json()["submitted_count"], stats.json()["student_count"], stats.json()["average_score"]), (1, 1, 0))
        self.assertEqual(stats.json()["questions"][0]["skipped_count"], 1)
        self.assertEqual(self.client().get(quiz_url + "/results").status_code, 403)
        self.assertEqual(self.client("teacher2").get(quiz_url + "/statistics").status_code, 404)
        self.client().delete(f"/api/v1/classrooms/{classroom}/members/me")
        self.assertEqual(self.client().get(url).status_code, 404)
        self.assertEqual(self.client().get(quiz_url + "/attempts/me").status_code, 404)
        self.assertEqual(len(self.client("teacher").get(quiz_url + "/results").json()), 1)

    def test_concurrent_start_and_submit_are_idempotent(self):
        _, quiz = self.prepared()
        def start(_):
            with Session(self.engine) as db, db.begin():
                return start_attempt(db, db.get(User, self.ids["student"]), quiz["id"], AttemptStartInput()).id
        with ThreadPoolExecutor(max_workers=2) as executor:
            ids = list(executor.map(start, range(2)))
        self.assertEqual(ids[0], ids[1])
        def submit(_):
            with Session(self.engine) as db, db.begin():
                return submit_attempt(db, db.get(User, self.ids["student"]), ids[0])
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(submit, range(2)))
        self.assertEqual(results[0]["submitted_at"], results[1]["submitted_at"])
        self.assertEqual(results[0]["score"], 0)

    def test_quiz_library_student_scope_metadata_and_no_answers(self):
        _, personal = self.prepared()
        classroom, assigned = self.prepared(classroom=True)
        with Session(self.engine) as db, db.begin():
            draft = Quiz(owner_id=self.ids["student"], document_id=personal["document_id"], title="Nháp của tôi",
                         difficulty="easy", generation_model="test-model")
            foreign = Quiz(owner_id=self.ids["other"], document_id=personal["document_id"], title="Nháp người khác",
                           difficulty="easy", generation_model="test-model")
            db.add_all([draft, foreign])
            db.flush()
            draft_id, foreign_id = str(draft.id), str(foreign.id)
        active = self.start(assigned)
        response = self.client().get("/api/v1/quizzes")
        self.assertEqual(response.status_code, 200, response.text)
        rows = {row["id"]: row for row in response.json()}
        self.assertEqual(set(rows), {personal["id"], assigned["id"], draft_id})
        self.assertNotIn(foreign_id, rows)
        self.assertEqual(rows[assigned["id"]]["active_attempt_id"], active["id"])
        self.assertEqual(rows[personal["id"]]["question_count"], 3)
        self.assertTrue(rows[personal["id"]]["is_owner"])
        self.assertFalse(rows[assigned["id"]]["is_owner"])
        self.assertEqual(rows[assigned["id"]]["classroom_title"], "Lớp 1")
        for field in ("questions", "correct_index", "explanation", "sources"):
            self.assertNotIn(field, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual({q["id"] for q in self.client().get("/api/v1/quizzes?scope=mine").json()}, {personal["id"], draft_id})
        self.assertEqual([q["id"] for q in self.client().get("/api/v1/quizzes?scope=assigned").json()], [assigned["id"]])
        self.assertEqual([q["id"] for q in self.client().get("/api/v1/quizzes?status=draft").json()], [draft_id])
        first = self.client().get("/api/v1/quizzes?limit=1").json()[0]["id"]
        second = self.client().get("/api/v1/quizzes?limit=1&offset=1").json()[0]["id"]
        self.assertNotEqual(first, second)
        self.assertEqual(self.client("other").get("/api/v1/quizzes").json(), [])

    def test_quiz_library_teacher_scope_and_role_validation(self):
        classroom, quiz = self.prepared(classroom=True)
        copied = self.client("teacher").post(f"/api/v1/quizzes/{quiz['id']}/copy").json()
        rows = self.client("teacher").get("/api/v1/quizzes").json()
        self.assertEqual({q["id"] for q in rows}, {quiz["id"], copied["id"]})
        self.assertTrue(all(q["is_owner"] for q in rows))
        self.assertEqual([q["id"] for q in self.client("teacher").get("/api/v1/quizzes?status=draft").json()], [copied["id"]])
        self.assertEqual([q["id"] for q in self.client("teacher").get("/api/v1/quizzes?scope=assigned").json()], [quiz["id"]])
        self.assertEqual(self.client("teacher2").get("/api/v1/quizzes").json(), [])
        self.assertEqual(self.client("admin").get("/api/v1/quizzes").status_code, 403)
        for query in ("scope=other", "status=other", "limit=0", "offset=-1"):
            self.assertEqual(self.client().get("/api/v1/quizzes?" + query).status_code, 422)

    def test_global_attempt_history_is_private_filtered_and_tracks_active_quiz(self):
        _, quiz = self.prepared()
        first = self.start(quiz)
        response = self.client().get("/api/v1/attempts/me?status=in_progress")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()[0]["id"], first["id"])
        self.assertNotIn("questions", response.text)
        self.assertEqual(self.client("other").get("/api/v1/attempts/me").json(), [])
        self.client().post(f"/api/v1/attempts/{first['id']}/submit")
        second = self.start(quiz, source_attempt_id=first["id"])
        self.assertEqual([a["id"] for a in self.client().get("/api/v1/attempts/me?status=in_progress").json()], [second["id"]])
        self.assertEqual([a["id"] for a in self.client().get("/api/v1/attempts/me?status=submitted").json()], [first["id"]])
        self.assertEqual(self.client().get("/api/v1/attempts/me?limit=1&offset=1").json()[0]["id"], first["id"])
        self.assertEqual(self.client().get("/api/v1/quizzes").json()[0]["active_attempt_id"], second["id"])
        self.assertEqual(self.client("teacher").get("/api/v1/attempts/me").status_code, 403)
        self.assertEqual(self.client("admin").get("/api/v1/attempts/me").status_code, 403)
        self.assertEqual(self.client().get("/api/v1/attempts/me?status=other").status_code, 422)

    def test_library_and_active_attempts_hide_revoked_or_deleted_sources(self):
        classroom, quiz = self.prepared(classroom=True)
        self.start(quiz)
        document_url = f"/api/v1/documents/{quiz['document_id']}"
        self.client("teacher").patch(document_url, json={"published": False})
        self.assertEqual(self.client().get("/api/v1/quizzes").json(), [])
        self.assertEqual(self.client().get("/api/v1/attempts/me").json(), [])
        self.client("teacher").patch(document_url, json={"published": True})
        self.assertEqual(len(self.client().get("/api/v1/quizzes").json()), 1)
        self.client().delete(f"/api/v1/classrooms/{classroom}/members/me")
        self.assertEqual(self.client().get("/api/v1/quizzes").json(), [])
        self.assertEqual(self.client().get("/api/v1/attempts/me").json(), [])
        self.join(classroom)
        self.assertEqual(len(self.client().get("/api/v1/attempts/me").json()), 1)
        self.client("teacher").delete(document_url)
        self.assertEqual(self.client("teacher").get("/api/v1/quizzes").json(), [])
        self.assertEqual(self.client().get("/api/v1/attempts/me").json(), [])


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(AttemptTests(name) for name in loader.getTestCaseNames(AttemptTests)
                              if name in AttemptTests.__dict__ and name.startswith("test_"))
