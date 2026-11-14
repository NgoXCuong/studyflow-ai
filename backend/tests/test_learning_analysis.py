import unittest

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.courses import Topic
from app.models.documents import Document
from app.models.quizzes import Quiz, QuizQuestion
from test_attempts import AttemptTests


class LearningAnalysisTests(AttemptTests):
    def analysis_quiz(self, count=5, topics=None):
        doc, quiz, _ = self.generate()
        with Session(self.engine) as db, db.begin():
            course_id = db.get(Document, doc["id"]).course_id
            original = db.get(QuizQuestion, quiz["questions"][0]["id"])
            original.topic = topics[0] if topics else "Cơ sở dữ liệu"
            for position in range(1, count):
                db.add(QuizQuestion(quiz_id=quiz["id"], position=position, question=f"Câu hỏi khác nhau {position + 1}",
                    choices=original.choices, correct_index=0, explanation=original.explanation,
                    topic=topics[position] if topics else original.topic, sources=original.sources))
        response = self.client().post(f"/api/v1/quizzes/{quiz['id']}/publish")
        self.assertEqual(response.status_code, 200, response.text)
        return str(course_id), self.client().get(f"/api/v1/quizzes/{quiz['id']}").json()

    def complete(self, quiz, correct=0, *, source=None, scope="full", skip_last=False):
        body = {"scope": scope}
        if source:
            body["source_attempt_id"] = source
        attempt = self.start(quiz, **body)
        for index, question in enumerate(attempt["questions"]):
            if skip_last and index == len(attempt["questions"]) - 1:
                continue
            answer = next(q for q in quiz["questions"] if q["id"] == question["id"])["correct_index"]
            selected = answer if index < correct else (answer + 1) % 4
            response = self.client().put(f"/api/v1/attempts/{attempt['id']}/answers/{question['id']}",
                                         json={"selected_index": selected})
            self.assertEqual(response.status_code, 200, response.text)
        response = self.client().post(f"/api/v1/attempts/{attempt['id']}/submit")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def analysis(self, course_id):
        response = self.client().get(f"/api/v1/courses/{course_id}/learning-analysis")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        return response.json()

    def test_no_data_is_not_zero_and_registered_topics_are_visible(self):
        course = self.course()
        self.assertEqual(self.analysis(course)["topics"], [])
        with Session(self.engine) as db, db.begin():
            db.add(Topic(course_id=course, title="Chưa học"))
        result = self.analysis(course)
        self.assertEqual((result["minimum_questions"], result["review_threshold"]), (5, 70))
        topic = result["topics"][0]
        self.assertEqual(topic["status"], "insufficient_data")
        self.assertIsNone(topic["accuracy"])
        self.assertIsNone(topic["initial_accuracy"])
        self.assertIsNone(topic["quiz_id"])
        self.assertEqual(topic["question_count"], 0)

    def test_normalized_topics_minimum_and_wrong_blank_answers(self):
        names = ["Cơ sở dữ liệu", "  CƠ   SỞ DỮ LIỆU  ", "cơ sở dữ liệu", "Cơ sở\tdữ liệu", "CƠ SỞ DỮ LIỆU"]
        course, quiz = self.analysis_quiz(topics=names)
        with Session(self.engine) as db, db.begin():
            db.add(Topic(course_id=course, title="cơ sở dữ liệu"))
            db.add(Topic(course_id=course, title="Mạng máy tính"))
        self.complete(quiz, correct=3, skip_last=True)
        result = self.analysis(course)
        self.assertEqual(len(result["topics"]), 2)
        topic = result["topics"][0]
        self.assertEqual(topic["topic_key"], "cơ sở dữ liệu")
        self.assertEqual((topic["question_count"], topic["correct_count"], topic["wrong_count"]), (5, 3, 2))
        self.assertEqual((topic["status"], topic["accuracy"], topic["initial_accuracy"]), ("needs_review", 60, 60))
        self.assertEqual(topic["available_question_count"], 5)
        self.assertEqual(topic["document_id"], quiz["document_id"])
        self.assertEqual(topic["page_number"], 1)
        self.assertEqual(result["topics"][1]["status"], "insufficient_data")

    def test_latest_full_results_replace_old_without_counting_wrong_only(self):
        course, quiz = self.analysis_quiz()
        first = self.complete(quiz)
        practice = self.complete(quiz, correct=5, source=first["id"], scope="wrong_only")
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["question_count"], topic["accuracy"], topic["status"]), (5, 0, "needs_review"))
        self.assertEqual((topic["practice_answer_count"], topic["practice_correct_count"]), (5, 5))
        latest = self.complete(quiz, correct=4, source=first["id"])
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["question_count"], topic["accuracy"], topic["initial_accuracy"]), (5, 80, 0))
        self.assertEqual(topic["status"], "on_track")
        self.assertEqual(topic["review_attempt_id"], latest["id"])
        url = f"/api/v1/courses/{course}/learning-analysis/history?topic=CƠ%20%20SỞ%20DỮ%20LIỆU"
        response = self.client().get(url)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["attempt_id"] for row in response.json()], [latest["id"], practice["id"], first["id"]])
        self.assertEqual(response.json()[0]["accuracy"], 80)
        self.assertEqual(self.client().get(url + "&limit=1&offset=1").json()[0]["attempt_id"], practice["id"])

    def test_copies_and_reordered_choices_do_not_inflate_evidence(self):
        course, quiz = self.analysis_quiz()
        self.complete(quiz)
        copied = self.client().post(f"/api/v1/quizzes/{quiz['id']}/copy").json()
        with Session(self.engine) as db, db.begin():
            for q in db.scalars(select(QuizQuestion).where(QuizQuestion.quiz_id == copied["id"])):
                q.question = "  " + q.question.upper() + "  "
                q.choices = [choice.upper() for choice in reversed(q.choices)]
                q.correct_index = 3
        response = self.client().post(f"/api/v1/quizzes/{copied['id']}/publish")
        self.assertEqual(response.status_code, 200, response.text)
        copied = self.client().get(f"/api/v1/quizzes/{copied['id']}").json()
        self.complete(copied, correct=5)
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["question_count"], topic["available_question_count"]), (5, 5))
        self.assertEqual((topic["accuracy"], topic["initial_accuracy"]), (100, 0))
        changed = self.client().post(f"/api/v1/quizzes/{copied['id']}/copy").json()
        with Session(self.engine) as db, db.begin():
            db.get(QuizQuestion, changed["questions"][0]["id"]).question = "Câu hỏi có nội dung thực sự mới"
        self.client().post(f"/api/v1/quizzes/{changed['id']}/publish")
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["question_count"], topic["available_question_count"]), (5, 6))

    def test_exact_threshold_is_on_track(self):
        course, quiz = self.analysis_quiz(count=10)
        self.complete(quiz, correct=7)
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["accuracy"], topic["status"]), (70, "on_track"))

    def test_insufficient_even_when_correct(self):
        course, quiz = self.analysis_quiz(count=4)
        self.complete(quiz, correct=4)
        topic = self.analysis(course)["topics"][0]
        self.assertEqual((topic["accuracy"], topic["status"]), (100, "insufficient_data"))

    def test_current_access_and_other_student_results_remain_private(self):
        classroom, quiz = self.prepared(classroom=True)
        with Session(self.engine) as db:
            course = str(db.get(Document, quiz["document_id"]).course_id)
        url = f"/api/v1/courses/{course}/learning-analysis"
        self.assertEqual(self.client("other").get(url).status_code, 404)
        self.assertEqual(self.client("teacher").get(url).status_code, 403)
        self.assertEqual(self.client("admin").get(url).status_code, 403)
        code = self.client("teacher").post(f"/api/v1/classrooms/{classroom}/join-code").json()["join_code"]
        self.client("other").post("/api/v1/classrooms/join", json={"join_code": code})
        attempt = self.client("other").post(f"/api/v1/quizzes/{quiz['id']}/attempts", json={}).json()
        self.client("other").post(f"/api/v1/attempts/{attempt['id']}/submit")
        self.assertEqual(self.analysis(course)["topics"][0]["question_count"], 0)
        history = self.client().get(url + "/history?topic=Học%20tập")
        self.assertEqual(history.json(), [])
        self.complete(quiz)
        self.assertEqual(self.analysis(course)["topics"][0]["question_count"], 3)
        self.client("teacher").patch(f"/api/v1/documents/{quiz['document_id']}", json={"published": False})
        self.assertEqual(self.analysis(course)["topics"], [])
        self.assertEqual(self.client().get(url + "/history?topic=Học%20tập").json(), [])
        self.client("teacher").patch(f"/api/v1/documents/{quiz['document_id']}", json={"published": True})
        self.client().delete(f"/api/v1/classrooms/{classroom}/members/me")
        self.assertEqual(self.client().get(url).status_code, 404)

    def test_unsubmitted_attempts_and_invalid_history_queries(self):
        course, quiz = self.analysis_quiz()
        self.start(quiz)
        self.assertEqual(self.analysis(course)["topics"][0]["question_count"], 0)
        url = f"/api/v1/courses/{course}/learning-analysis/history"
        for query in ("", "?topic=%20", "?topic=test&limit=0", "?topic=test&offset=-1"):
            self.assertEqual(self.client().get(url + query).status_code, 422)
        self.assertEqual(self.client().get(url + "?topic=Unknown").json(), [])
        self.assertEqual(self.client("other").get(url + "?topic=test").status_code, 404)


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(LearningAnalysisTests(name) for name in loader.getTestCaseNames(LearningAnalysisTests)
                              if name in LearningAnalysisTests.__dict__ and name.startswith("test_"))
