import unittest

from sqlalchemy.orm import Session

from app.models.quizzes import Quiz, QuizQuestion
from test_learning_analysis import LearningAnalysisTests


class ClassroomReportTests(LearningAnalysisTests):
    def assigned(self):
        classroom, doc, quiz, _ = self.class_quiz()
        with Session(self.engine) as db, db.begin():
            original = db.get(QuizQuestion, quiz["questions"][0]["id"])
            original.topic = " SQL "
            for position, topic in ((1, "sql"), (2, "Khác")):
                db.add(QuizQuestion(quiz_id=quiz["id"], position=position, question=f"Câu hỏi {position + 1}",
                    choices=original.choices, correct_index=0, explanation=original.explanation, topic=topic, sources=original.sources))
        self.assertEqual(self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": True}).status_code, 200)
        self.assertEqual(self.client("teacher").post(f"/api/v1/quizzes/{quiz['id']}/publish").status_code, 200)
        return classroom, doc, self.client("teacher").get(f"/api/v1/quizzes/{quiz['id']}").json()

    def add_other(self, classroom):
        code = self.client("teacher").post(f"/api/v1/classrooms/{classroom}/join-code").json()["join_code"]
        self.assertEqual(self.client("other").post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 200)

    def report(self, classroom, query=""):
        response = self.client("teacher").get(f"/api/v1/classrooms/{classroom}/report{query}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        return response.json()

    def test_empty_report_and_unsubmitted_members(self):
        _, classroom = self.classroom()
        empty = self.report(classroom)
        self.assertEqual((empty["current_member_count"], empty["quiz_count"], empty["submitted_count"]), (0, 0, 0))
        self.assertEqual((empty["quizzes"], empty["topics"]), ([], []))
        self.join(classroom)
        students = self.client("teacher").get(f"/api/v1/classrooms/{classroom}/report/students").json()
        self.assertEqual(students[0]["submitted_count"], 0)
        self.assertIsNone(students[0]["average_score"])

    def test_statistics_match_m08_topics_and_current_submission_counts(self):
        classroom, _, quiz = self.assigned()
        self.add_other(classroom)
        first = self.complete(quiz, correct=1, skip_last=True)
        self.complete(quiz, correct=3, source=first["id"], scope="wrong_only")
        self.complete(quiz, correct=3, source=first["id"])
        self.start(quiz)  # In-progress attempt must not contribute to any report totals.
        result = self.report(classroom)
        self.assertEqual((result["current_member_count"], result["quiz_count"], result["submitted_count"]), (2, 1, 3))
        stats = self.client("teacher").get(f"/api/v1/quizzes/{quiz['id']}/statistics").json()
        item = result["quizzes"][0]
        for field in ("submitted_count", "student_count", "average_score"):
            self.assertEqual(item[field], stats[field])
        self.assertEqual((item["question_count"], item["current_submitted_count"], item["current_not_submitted_count"]), (3, 1, 1))
        topics = {topic["topic_key"]: topic for topic in result["topics"]}
        self.assertEqual(len(topics), 2)
        self.assertEqual((topics["sql"]["answer_count"], topics["sql"]["correct_count"], topics["sql"]["accuracy"]), (5, 4, 80))
        self.assertEqual((topics["khác"]["answer_count"], topics["khác"]["wrong_count"], topics["khác"]["skipped_count"]), (3, 1, 1))
        self.assertEqual(topics["khác"]["accuracy"], 66.67)
        for topic in topics.values():
            self.assertNotIn("status", topic)
        students = self.client("teacher").get(f"/api/v1/classrooms/{classroom}/report/students").json()
        mine = next(row for row in students if row["student_id"] == str(self.ids["student"]))
        self.assertEqual((mine["submitted_quiz_count"], mine["submitted_count"], mine["average_score"]), (1, 3, stats["average_score"]))

    def test_former_members_remain_in_history_not_current_denominator(self):
        classroom, _, quiz = self.assigned()
        self.add_other(classroom)
        attempt = self.complete(quiz)
        self.assertEqual(self.client().delete(f"/api/v1/classrooms/{classroom}/members/me").status_code, 200)
        result = self.report(classroom)
        item = result["quizzes"][0]
        self.assertEqual((result["current_member_count"], item["student_count"], item["current_submitted_count"], item["current_not_submitted_count"]), (1, 1, 0, 1))
        base = f"/api/v1/classrooms/{classroom}/report"
        current = self.client("teacher").get(base + "/students").json()
        self.assertEqual([row["student_id"] for row in current], [str(self.ids["other"])])
        all_students = self.client("teacher").get(base + "/students?include_left=true").json()
        self.assertEqual(len(all_students), 2)
        rows = self.client("teacher").get(base + f"/attempts?student_id={self.ids['student']}").json()
        self.assertEqual([row["id"] for row in rows], [attempt["id"]])

    def test_private_quiz_draft_and_deleted_document_excluded(self):
        classroom, doc, quiz = self.assigned()
        with Session(self.engine) as db, db.begin():
            private = Quiz(owner_id=self.ids["student"], document_id=doc["id"], title="Quiz cá nhân", difficulty="easy", generation_model="test-model")
            db.add(private)
            db.flush()
            original = quiz["questions"][0]
            db.add(QuizQuestion(quiz_id=private.id, position=0, **{key: original[key] for key in (
                "question", "choices", "correct_index", "explanation", "topic", "sources")}))
            private_id = str(private.id)
        self.assertEqual(self.client().post(f"/api/v1/quizzes/{private_id}/publish").status_code, 200)
        private_quiz = self.client().get(f"/api/v1/quizzes/{private_id}").json()
        self.complete(private_quiz, correct=1)
        self.assertEqual(self.client("teacher").post(f"/api/v1/quizzes/{quiz['id']}/copy").status_code, 201)
        report = self.report(classroom)
        self.assertEqual((report["quiz_count"], report["submitted_count"], report["quizzes"][0]["average_score"]), (1, 0, None))
        self.assertEqual(report["topics"], [])
        self.complete(quiz)
        self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": False})
        self.assertEqual(self.report(classroom)["submitted_count"], 1)
        self.assertEqual(self.client("teacher").delete(f"/api/v1/documents/{doc['id']}").status_code, 200)
        report = self.report(classroom)
        self.assertEqual((report["quiz_count"], report["submitted_count"], report["topics"]), (0, 0, []))

    def test_roles_ownership_classroom_isolation_and_validation(self):
        classroom, doc, quiz = self.assigned()
        self.complete(quiz)
        base = f"/api/v1/classrooms/{classroom}/report"
        for name, status in (("student", 403), ("admin", 403), ("teacher2", 404)):
            for suffix in ("", "/students", "/attempts"):
                self.assertEqual(self.client(name).get(base + suffix).status_code, status)
        other_class = self.client("teacher").post(f"/api/v1/courses/{doc['course_id']}/classrooms", json={"title": "Lớp khác"}).json()["id"]
        self.assertEqual(self.report(other_class)["submitted_count"], 0)
        self.assertEqual(self.client("teacher").get(f"/api/v1/classrooms/{other_class}/report/attempts?student_id={self.ids['student']}").status_code, 404)
        for suffix in ("?limit=0", "?offset=-1", "/students?limit=101", "/attempts?student_id=invalid"):
            self.assertEqual(self.client("teacher").get(base + suffix).status_code, 422)
        self.client("teacher").cookies.clear()
        self.assertEqual(self.client("teacher").get(base).status_code, 401)

    def test_pagination_totals_and_student_attempt_filters(self):
        classroom, _, quiz = self.assigned()
        first = self.complete(quiz)
        second = self.complete(quiz, source=first["id"], correct=3)
        base = f"/api/v1/classrooms/{classroom}/report"
        empty_page = self.report(classroom, "?limit=1&offset=1")
        self.assertEqual((empty_page["quiz_count"], empty_page["submitted_count"], empty_page["quizzes"]), (1, 2, []))
        self.assertTrue(empty_page["topics"])
        first_page = self.client("teacher").get(base + "/attempts?limit=1").json()
        next_page = self.client("teacher").get(base + "/attempts?limit=1&offset=1").json()
        self.assertEqual([first_page[0]["id"], next_page[0]["id"]], [second["id"], first["id"]])
        self.assertNotIn("questions", first_page[0])
        students = self.client("teacher").get(base + "/students?limit=1&offset=1").json()
        self.assertEqual(students, [])


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(ClassroomReportTests(name) for name in loader.getTestCaseNames(ClassroomReportTests) if name in ClassroomReportTests.__dict__)
