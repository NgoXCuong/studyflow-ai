import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy.orm import Session

from app.models.courses import Topic
from app.models.study_plans import StudyPlan
from app.services.study_plans import first_fit
from test_learning_analysis import LearningAnalysisTests


class StudyPlanTests(LearningAnalysisTests):
    def body(self, course_id, minutes=180):
        start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
        return {"course_id": course_id, "goal": "Ôn tập trước kỳ thi", "exam_date": (start + timedelta(days=3)).date().isoformat(),
                "availability": [{"start_at": start.isoformat(), "end_at": (start + timedelta(minutes=minutes)).isoformat()}]}

    def plan(self, body):
        response = self.client().post("/api/v1/study-plans", json=body)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        return response.json()

    def test_priority_sequence_missing_sources_and_completed_preserved(self):
        course, quiz = self.analysis_quiz(count=10, topics=["Tạm ổn"] * 5 + ["Cần ôn"] * 5)
        self.complete(quiz, correct=5)
        with Session(self.engine) as db, db.begin():
            db.add(Topic(course_id=course, title="Chưa có dữ liệu"))
        plan = self.plan(self.body(course))
        scheduled = sorted([task for task in plan["tasks"] if task["scheduled_at"]], key=lambda task: task["scheduled_at"])
        self.assertEqual([task["kind"] for task in scheduled], ["read", "quiz", "review"] * 2)
        self.assertEqual([task["topic"] for task in scheduled], ["Cần ôn"] * 3 + ["Tạm ổn"] * 3)
        self.assertEqual([task["duration_minutes"] for task in scheduled[:3]], [20, 20, 15])
        missing = [task for task in plan["tasks"] if task["topic"] == "Chưa có dữ liệu"]
        self.assertEqual(len(missing), 3)
        self.assertTrue(all(task["unscheduled_reason"] and not task["scheduled_at"] for task in missing))
        task = scheduled[0]
        url = f"/api/v1/study-plans/{plan['id']}"
        updated = self.client().patch(f"{url}/tasks/{task['id']}", json={"completed": True})
        self.assertEqual(updated.status_code, 200, updated.text)
        completed = next(item for item in updated.json()["tasks"] if item["id"] == task["id"])
        again = self.client().post(url + "/reschedule")
        self.assertEqual(again.status_code, 200, again.text)
        self.assertEqual(next(item for item in again.json()["tasks"] if item["id"] == task["id"]), completed)

    def test_insufficient_time_retains_tasks_and_does_not_split(self):
        course, _ = self.analysis_quiz()
        body = self.body(course, 19)
        plan = self.plan(body)
        self.assertEqual(len(plan["tasks"]), 3)
        self.assertTrue(all(task["scheduled_at"] is None and task["unscheduled_reason"] for task in plan["tasks"]))
        body.pop("course_id")
        start = datetime.fromisoformat(body["availability"][0]["start_at"])
        body["availability"][0]["end_at"] = (start + timedelta(hours=1)).isoformat()
        updated = self.client().put(f"/api/v1/study-plans/{plan['id']}", json=body)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertTrue(all(task["scheduled_at"] for task in updated.json()["tasks"]))

    def test_plans_do_not_overlap_even_with_concurrent_requests(self):
        course, _ = self.analysis_quiz()
        body = self.body(course, 60)
        owner = self.client()
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: owner.post("/api/v1/study-plans", json=body), range(2)))
        self.assertEqual([response.status_code for response in responses], [201, 201])
        tasks = [task for response in responses for task in response.json()["tasks"] if task["scheduled_at"]]
        intervals = sorted((datetime.fromisoformat(task["scheduled_at"]), task["duration_minutes"]) for task in tasks)
        for (start, minutes), (next_start, _) in zip(intervals, intervals[1:]):
            self.assertLessEqual(start + timedelta(minutes=minutes), next_start)

    def test_validation_timezone_overlap_and_future(self):
        course = self.course()
        body = self.body(course)
        bad = {**body, "availability": body["availability"] * 2}
        self.assertEqual(self.client().post("/api/v1/study-plans", json=bad).status_code, 422)
        bad = {**body, "read_minutes": True}
        self.assertEqual(self.client().post("/api/v1/study-plans", json=bad).status_code, 422)
        bad = {**body, "availability": [{"start_at": body["exam_date"] + "T00:00:00+07:00", "end_at": body["exam_date"] + "T01:00:00+07:00"}]}
        self.assertEqual(self.client().post("/api/v1/study-plans", json=bad).status_code, 422)
        bad = {**body, "availability": [{"start_at": "2020-01-01T08:00:00+07:00", "end_at": "2020-01-01T09:00:00+07:00"}]}
        self.assertEqual(self.client().post("/api/v1/study-plans", json=bad).status_code, 422)
        bad = {**body, "availability": [{"start_at": "2040-01-01T08:00:00", "end_at": "2040-01-01T09:00:00"}]}
        self.assertEqual(self.client().post("/api/v1/study-plans", json=bad).status_code, 422)

    def test_access_and_delete(self):
        course = self.course()
        plan = self.plan(self.body(course))
        url = f"/api/v1/study-plans/{plan['id']}"
        self.assertEqual(self.client("other").get(url).status_code, 404)
        self.assertEqual(self.client("other").get("/api/v1/study-plans").json(), [])
        self.assertEqual(self.client("other").post(url + "/reschedule").status_code, 404)
        self.assertEqual(self.client("teacher").get("/api/v1/study-plans").status_code, 403)
        self.assertEqual(self.client("admin").post("/api/v1/study-plans", json=self.body(course)).status_code, 403)
        self.assertEqual(self.client().get("/api/v1/study-plans?limit=0").status_code, 422)
        self.assertEqual(self.client().get(url).status_code, 200)
        self.assertEqual(self.client().delete(url).status_code, 204)
        self.assertEqual(self.client().get(url).status_code, 404)
        with Session(self.engine) as db:
            self.assertIsNone(db.get(StudyPlan, plan["id"]))

    def test_task_edits_conflict_and_duration_survives_reschedule(self):
        course, _ = self.analysis_quiz()
        plan = self.plan(self.body(course))
        tasks = {task["kind"]: task for task in plan["tasks"]}
        url = f"/api/v1/study-plans/{plan['id']}"
        endpoint = f"{url}/tasks/{tasks['review']['id']}"
        self.assertEqual(self.client().patch(endpoint, json={}).status_code, 422)
        self.assertEqual(self.client().patch(endpoint, json={"scheduled_at": tasks["read"]["scheduled_at"]}).status_code, 409)
        response = self.client().patch(endpoint, json={"duration_minutes": 10})
        self.assertEqual(response.status_code, 200, response.text)
        result = self.client().post(url + "/reschedule")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(next(task for task in result.json()["tasks"] if task["kind"] == "review")["duration_minutes"], 10)
        out_of_slot = (datetime.fromisoformat(tasks["read"]["scheduled_at"]) + timedelta(days=1)).isoformat()
        self.assertEqual(self.client().patch(endpoint, json={"scheduled_at": out_of_slot}).status_code, 422)
        self.assertEqual(self.client().patch(f"{url}/tasks/{tasks['read']['id']}", json={"scheduled_at": None}).status_code, 409)

    def test_reschedule_only_uses_remaining_future_time(self):
        course, _ = self.analysis_quiz()
        body = self.body(course, 60)
        plan = self.plan(body)
        start = datetime.fromisoformat(body["availability"][0]["start_at"])
        now = start + timedelta(minutes=10)
        with patch("app.services.study_plans.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            response = self.client().post(f"/api/v1/study-plans/{plan['id']}/reschedule")
        self.assertEqual(response.status_code, 200, response.text)
        tasks = response.json()["tasks"]
        self.assertTrue(all(datetime.fromisoformat(task["scheduled_at"]) > now for task in tasks if task["scheduled_at"]))
        self.assertIsNone(next(task for task in tasks if task["kind"] == "review")["scheduled_at"])

    def test_revoked_membership_and_origin_are_checked(self):
        classroom, doc, quiz, _ = self.class_quiz()
        self.client("teacher").patch(f"/api/v1/documents/{doc['id']}", json={"published": True})
        self.assertEqual(self.client("teacher").post(f"/api/v1/quizzes/{quiz['id']}/publish").status_code, 200)
        plan = self.plan(self.body(doc["course_id"]))
        url = f"/api/v1/study-plans/{plan['id']}"
        self.assertEqual(self.client().post(url + "/reschedule", headers={"Origin": "https://outside.example"}).status_code, 403)
        self.assertEqual(self.client().delete(f"/api/v1/classrooms/{classroom}/members/me").status_code, 200)
        self.assertEqual(self.client().get(url).status_code, 404)
        self.assertEqual(self.client().post(url + "/reschedule").status_code, 404)
        self.assertEqual(self.client().get("/api/v1/study-plans").json(), [])

    def test_deleted_source_not_linked_or_marked_complete(self):
        course, quiz = self.analysis_quiz()
        plan = self.plan(self.body(course))
        self.assertEqual(self.client().delete(f"/api/v1/documents/{quiz['document_id']}").status_code, 200)
        url = f"/api/v1/study-plans/{plan['id']}"
        output = self.client().get(url).json()
        self.assertTrue(all(task["document_id"] is None and task["quiz_id"] is None and task["unscheduled_reason"] for task in output["tasks"]))
        self.assertEqual(self.client().patch(f"{url}/tasks/{plan['tasks'][0]['id']}", json={"completed": True}).status_code, 409)
        response = self.client().post(url + "/reschedule")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(all(task["scheduled_at"] is None for task in response.json()["tasks"]))


class SchedulingTests(unittest.TestCase):
    def test_first_fit_respects_gaps_and_earliest_start(self):
        start = datetime(2040, 1, 1, tzinfo=timezone.utc)
        minutes = lambda value: timedelta(minutes=value)
        slots = [(start, start + minutes(60)), (start + minutes(120), start + minutes(180))]
        busy = [(start + minutes(10), start + minutes(40))]
        self.assertEqual(first_fit(slots, busy, minutes(20), start), start + minutes(40))
        self.assertEqual(first_fit(slots, busy, minutes(25), start), start + minutes(120))
        self.assertIsNone(first_fit(slots, busy, minutes(61), start))
        self.assertIsNone(first_fit(slots, [], minutes(20), start + minutes(170)))


def load_tests(loader, tests, pattern):
    return unittest.TestSuite([loader.loadTestsFromTestCase(SchedulingTests),
        unittest.TestSuite(StudyPlanTests(name) for name in loader.getTestCaseNames(StudyPlanTests) if name in StudyPlanTests.__dict__)])
