import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.courses import Topic
from app.models.study_plans import StudyTask
from test_study_plans import StudyPlanTests


class OverviewTests(StudyPlanTests):
    def overview(self, course_id=None, now=None):
        path = "/api/v1/overview" + (f"?course_id={course_id}" if course_id else "")
        with patch("app.services.overview.datetime", wraps=datetime) as clock:
            clock.now.return_value = now or datetime.now(timezone.utc)
            response = self.client().get(path)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        return response.json()

    def future_body(self, course):
        return {"course_id": course, "goal": "Ôn tập", "exam_date": "2040-01-10", "availability": [
            {"start_at": "2040-01-01T08:00:00Z", "end_at": "2040-01-09T08:00:00Z"}]}

    def test_empty_overview_and_role_boundaries(self):
        result = self.overview()
        self.assertIsNone(result["analysis"])
        self.assertEqual(result["plan_progress"], {"plan_count": 0, "task_count": 0, "completed_task_count": 0, "unscheduled_task_count": 0})
        for key in ("today_tasks", "overdue_tasks", "active_attempts", "recent_attempts"):
            self.assertEqual(result[key], [])
        for name in ("teacher", "admin"):
            self.assertEqual(self.client(name).get("/api/v1/overview").status_code, 403)
        self.assertEqual(self.client().get("/api/v1/overview?course_id=invalid").status_code, 422)
        self.assertEqual(self.client().get(f"/api/v1/overview?course_id={self.course('other')}").status_code, 404)
        self.client().cookies.clear()
        self.assertEqual(self.client().get("/api/v1/overview").status_code, 401)

    def test_topics_without_sources_count_as_unplanned(self):
        course = self.course()
        with Session(self.engine) as db, db.begin():
            db.add(Topic(course_id=course, title="Chưa có nguồn"))
        self.plan(self.future_body(course))
        result = self.overview(course)
        self.assertEqual(result["plan_progress"], {"plan_count": 1, "task_count": 3, "completed_task_count": 0, "unscheduled_task_count": 3})
        self.assertEqual((result["today_count"], result["overdue_count"]), (0, 0))

    def test_vietnam_day_end_time_and_completed_tasks(self):
        course, _ = self.analysis_quiz(count=10, topics=["A"] * 5 + ["B"] * 5)
        plan = self.plan(self.future_body(course))
        now = datetime(2040, 1, 1, 18, 30, tzinfo=timezone.utc)  # 01:30 on Jan 2 in Vietnam.
        with Session(self.engine) as db, db.begin():
            tasks = list(db.scalars(select(StudyTask).where(StudyTask.plan_id == plan["id"]).order_by(StudyTask.id)))
            tasks[0].scheduled_at = now + timedelta(minutes=30)
            tasks[1].scheduled_at = now - timedelta(minutes=20)  # Ends exactly now: overdue.
            tasks[2].scheduled_at = now - timedelta(days=1)
            tasks[3].scheduled_at = datetime(2040, 1, 2, 17, tzinfo=timezone.utc)  # Tomorrow at 00:00.
            tasks[4].completed_at = now
            tasks[5].scheduled_at = None
            tasks[5].unscheduled_reason = "Thiếu thời gian"
            for task in tasks[:4]:
                task.duration_minutes = 20
            expected_today, expected_overdue = str(tasks[0].id), {str(tasks[1].id), str(tasks[2].id)}
        result = self.overview(course, now)
        self.assertEqual((result["date"], result["timezone"]), ("2040-01-02", "UTC+7"))
        self.assertEqual((result["today_count"], result["overdue_count"]), (1, 2))
        self.assertEqual([task["id"] for task in result["today_tasks"]], [expected_today])
        self.assertEqual({task["id"] for task in result["overdue_tasks"]}, expected_overdue)
        self.assertEqual(result["plan_progress"], {"plan_count": 1, "task_count": 6, "completed_task_count": 1, "unscheduled_task_count": 1})

    def test_running_task_crossing_midnight_and_preview_counts(self):
        course, _ = self.analysis_quiz(count=10, topics=["A"] * 5 + ["B"] * 5)
        plan = self.plan(self.future_body(course))
        now = datetime(2040, 1, 1, 17, 5, tzinfo=timezone.utc)
        with Session(self.engine) as db, db.begin():
            tasks = list(db.scalars(select(StudyTask).where(StudyTask.plan_id == plan["id"]).order_by(StudyTask.id)))
            for index, task in enumerate(tasks):
                task.scheduled_at = now - timedelta(minutes=10) + timedelta(minutes=20 * index)
                task.duration_minutes = 20
            first = str(tasks[0].id)
        result = self.overview(course, now)
        self.assertEqual((result["today_count"], len(result["today_tasks"]), result["overdue_count"]), (6, 5, 0))
        self.assertEqual(result["today_tasks"][0]["id"], first)

    def test_analysis_matches_m11_and_does_not_treat_unknown_as_weak(self):
        course, quiz = self.analysis_quiz()
        self.complete(quiz, correct=2)
        with Session(self.engine) as db, db.begin():
            db.add(Topic(course_id=course, title="Chưa học"))
        result = self.overview(course)
        self.assertEqual(result["analysis"], self.analysis(course))
        self.assertEqual([topic["status"] for topic in result["analysis"]["topics"]], ["needs_review", "insufficient_data"])
        another = self.course()
        self.assertEqual(self.overview(another)["analysis"]["topics"], [])

    def test_submitted_order_and_no_answers_in_active_attempts(self):
        course, quiz = self.analysis_quiz()
        self.start(quiz)
        copied = self.client().post(f"/api/v1/quizzes/{quiz['id']}/copy")
        self.assertEqual(copied.status_code, 201, copied.text)
        second_quiz = copied.json()
        self.assertEqual(self.client().post(f"/api/v1/quizzes/{second_quiz['id']}/publish").status_code, 200)
        second = self.complete(second_quiz, correct=4)
        first = self.complete(quiz, correct=2)
        active = self.start(quiz)
        result = self.overview(course)
        self.assertEqual([item["id"] for item in result["recent_attempts"]], [first["id"], second["id"]])
        self.assertEqual(result["recent_attempts"][0]["score"], first["score"])
        self.assertEqual(result["active_attempts"][0]["id"], active["id"])
        self.assertEqual(result["active_attempts"][0]["course_id"], course)
        for attempt in result["active_attempts"]:
            self.assertIsNone(attempt["score"])
            self.assertIsNone(attempt["correct_count"])
            self.assertNotIn("questions", attempt)
            self.assertNotIn("student_id", attempt)

    def test_own_data_only_and_revoked_sources_membership(self):
        classroom, doc, quiz, _ = self.class_quiz()
        code = self.client("teacher").post(f"/api/v1/classrooms/{classroom}/join-code").json()["join_code"]
        self.assertEqual(self.client("other").post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 200)
        self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": True})
        self.assertEqual(self.client("teacher").post(f"/api/v1/quizzes/{quiz['id']}/publish").status_code, 200)
        mine = self.start(quiz)
        other = self.client("other").post(f"/api/v1/quizzes/{quiz['id']}/attempts", json={})
        self.assertEqual(other.status_code, 200, other.text)
        self.plan(self.future_body(doc["course_id"]))
        self.assertEqual(self.client("other").post("/api/v1/study-plans", json=self.future_body(doc["course_id"])).status_code, 201)
        now = datetime(2040, 1, 1, 8, tzinfo=timezone.utc)
        result = self.overview(doc["course_id"], now)
        self.assertEqual(result["plan_progress"]["plan_count"], 1)
        self.assertEqual(result["plan_progress"]["task_count"], 3)
        self.assertEqual([attempt["id"] for attempt in result["active_attempts"]], [mine["id"]])
        self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": False})
        result = self.overview(doc["course_id"], now)
        self.assertEqual((result["today_count"], result["overdue_count"]), (0, 0))
        self.assertEqual(result["active_attempts"], [])
        self.assertEqual(result["plan_progress"]["unscheduled_task_count"], 3)
        self.client().delete(f"/api/v1/classrooms/{classroom}/members/me")
        result = self.overview(now=now)
        self.assertEqual(result["plan_progress"]["plan_count"], 0)
        self.assertIsNone(result["analysis"])


def load_tests(loader, tests, pattern):
    return unittest.TestSuite(OverviewTests(name) for name in loader.getTestCaseNames(OverviewTests) if name in OverviewTests.__dict__)
