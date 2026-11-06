import secrets
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic import SecretStr
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.dependencies import _attempts
from app.core.config import get_settings
from app.core.security import password_hasher, token_hash
from app.db.connection import get_db, get_engine
from app.main import app
from app.models.auth import User
from app.models.courses import Classroom, ClassroomMember, Course


class CourseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = "test_courses_" + uuid4().hex
        cls.settings = get_settings()
        cls.origin = cls.settings.allowed_origins[0]
        cls.patches = [
            patch.object(cls.settings, "auth_secret", SecretStr(secrets.token_urlsafe(48))),
            patch.object(cls.settings, "email_verification_required", False),
            patch.object(cls.settings, "cookie_secure", False),
        ]
        for item in cls.patches:
            item.start()
        cls.connection_options = get_engine().url.translate_connect_args(username="user", database="dbname")
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(cls.schema)))
        cls.engine = create_engine(get_engine().url, connect_args={
            "options": f"-csearch_path={cls.schema},public", "connect_timeout": 5,
        })
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        with cls.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            command.check(config)

        def test_db():
            with Session(cls.engine, expire_on_commit=False) as session, session.begin():
                yield session

        app.dependency_overrides[get_db] = test_db
        cls.password = "Course-tests-password-1"
        cls.password_hash = password_hasher.hash(cls.password)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()
        if not cls.schema.startswith("test_courses_") or len(cls.schema) != 45:
            raise RuntimeError("Unexpected test schema")
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(cls.schema)))
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        _attempts.clear()
        with self.engine.begin() as connection:
            connection.exec_driver_sql(
                "TRUNCATE document_chunks, document_processing_jobs, ai_usage_logs, documents, admin_audit_logs, topics, chapters, classroom_members, classrooms, courses, auth_tokens, auth_sessions, users"
            )
        self.ids = {}
        with Session(self.engine) as db, db.begin():
            for name, role in (("student", "student"), ("other", "student"),
                               ("teacher", "teacher"), ("teacher2", "teacher"), ("admin", "admin")):
                user = User(id=uuid4(), email=f"{name}@example.com", full_name=name,
                            password_hash=self.password_hash, role=role)
                db.add(user)
                self.ids[name] = user.id
        self.clients = {}

    def client(self, name="student"):
        if name not in self.clients:
            client = TestClient(app, headers={"Origin": self.origin})
            self.addCleanup(client.close)
            response = client.post("/api/v1/auth/login", json={
                "email": f"{name}@example.com", "password": self.password,
            })
            self.assertEqual(response.status_code, 200, response.text)
            self.clients[name] = client
        return self.clients[name]

    def course(self, name="student"):
        response = self.client(name).post("/api/v1/courses", json={
            "title": "  Cơ sở dữ liệu  ", "kind": "teaching" if name.startswith("teacher") else "personal",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def classroom(self):
        course_id = self.course("teacher")
        response = self.client("teacher").post(f"/api/v1/courses/{course_id}/classrooms", json={"title": "Lớp A"})
        self.assertEqual(response.status_code, 201, response.text)
        return course_id, response.json()["id"]

    def code(self, classroom_id):
        response = self.client("teacher").post(f"/api/v1/classrooms/{classroom_id}/join-code")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["join_code"]

    def join(self, classroom_id, name="student"):
        response = self.client(name).post("/api/v1/classrooms/join", json={"join_code": self.code(classroom_id)})
        self.assertEqual(response.status_code, 200, response.text)
        return response

    def test_personal_course_crud_and_isolation(self):
        course_id = self.course()
        owner, other = self.client(), self.client("other")
        self.assertEqual(owner.get(f"/api/v1/courses/{course_id}").json()["title"], "Cơ sở dữ liệu")
        self.assertEqual(other.get("/api/v1/courses").json(), [])
        self.assertEqual(other.get(f"/api/v1/courses/{course_id}").status_code, 404)
        self.assertEqual(other.patch(f"/api/v1/courses/{course_id}", json={"title": "X"}).status_code, 403)
        self.assertEqual(other.delete(f"/api/v1/courses/{course_id}").status_code, 403)
        self.assertEqual(self.client("admin").get(f"/api/v1/courses/{course_id}").status_code, 404)
        updated = owner.patch(f"/api/v1/courses/{course_id}", json={"description": "Mô tả"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["description"], "Mô tả")
        self.assertEqual(owner.delete(f"/api/v1/courses/{course_id}").status_code, 200)
        self.assertEqual(owner.get(f"/api/v1/courses/{course_id}").status_code, 404)
        self.assertEqual(owner.get("/api/v1/courses").json(), [])
        with Session(self.engine) as db:
            self.assertIsNotNone(db.get(Course, course_id).deleted_at)

    def test_role_boundaries_and_no_owner_override(self):
        self.assertEqual(self.client().post("/api/v1/courses", json={"title": "X", "kind": "teaching"}).status_code, 403)
        self.assertEqual(self.client("teacher").post("/api/v1/courses", json={"title": "X"}).status_code, 403)
        self.assertEqual(self.client("admin").post("/api/v1/courses", json={"title": "X"}).status_code, 403)
        self.assertEqual(self.client().post("/api/v1/courses", json={
            "title": "X", "owner_id": str(self.ids["other"]),
        }).status_code, 422)
        course_id = self.course()
        self.assertEqual(self.client().post(f"/api/v1/courses/{course_id}/classrooms", json={"title": "X"}).status_code, 403)

    def test_chapters_topics_and_cross_course_validation(self):
        client = self.client()
        first, second = self.course(), self.course()
        chapter = client.post(f"/api/v1/courses/{first}/chapters", json={"title": "Chương 1", "position": 2}).json()["id"]
        topic_response = client.post(f"/api/v1/courses/{first}/topics", json={"title": "SQL", "chapter_id": chapter})
        self.assertEqual(topic_response.status_code, 201, topic_response.text)
        topic = topic_response.json()["id"]
        self.assertEqual(client.post(f"/api/v1/courses/{second}/topics", json={"title": "Sai", "chapter_id": chapter}).status_code, 404)
        self.assertEqual(client.patch(f"/api/v1/courses/{second}/chapters/{chapter}", json={"title": "Sai"}).status_code, 404)
        self.assertEqual(client.patch(f"/api/v1/courses/{second}/topics/{topic}", json={"title": "Sai"}).status_code, 404)
        foreign_chapter = client.post(f"/api/v1/courses/{second}/chapters", json={"title": "Chương khác"}).json()["id"]
        self.assertEqual(client.patch(f"/api/v1/courses/{first}/topics/{topic}", json={"chapter_id": foreign_chapter}).status_code, 404)
        self.assertEqual(client.delete(f"/api/v1/courses/{first}/chapters/{chapter}").status_code, 409)
        self.assertEqual(client.patch(f"/api/v1/courses/{first}/chapters/{chapter}", json={"position": 1}).status_code, 200)
        self.assertEqual(client.get(f"/api/v1/courses/{first}/chapters").json()[0]["position"], 1)
        self.assertEqual(len(client.get(f"/api/v1/courses/{first}/topics", params={"chapter_id": chapter}).json()), 1)
        self.assertEqual(client.patch(f"/api/v1/courses/{first}/topics/{topic}", json={"chapter_id": None}).status_code, 200)
        self.assertEqual(client.delete(f"/api/v1/courses/{first}/chapters/{chapter}").status_code, 200)
        self.assertEqual(client.delete(f"/api/v1/courses/{first}/topics/{topic}").status_code, 200)

    def test_join_read_permissions_and_classroom_isolation(self):
        course_id, classroom_id = self.classroom()
        teacher, student = self.client("teacher"), self.client()
        self.assertEqual(student.get(f"/api/v1/courses/{course_id}").status_code, 404)
        self.assertEqual(student.get(f"/api/v1/classrooms/{classroom_id}").status_code, 404)
        self.join(classroom_id)
        teacher.post(f"/api/v1/courses/{course_id}/chapters", json={"title": "Chương 1"})
        teacher.post(f"/api/v1/courses/{course_id}/topics", json={"title": "SQL"})
        for path in (f"/api/v1/courses/{course_id}", f"/api/v1/courses/{course_id}/chapters",
                     f"/api/v1/courses/{course_id}/topics", f"/api/v1/classrooms/{classroom_id}"):
            self.assertEqual(student.get(path).status_code, 200, path)
            self.assertEqual(self.client("other").get(path).status_code, 404, path)
        self.assertEqual(len(student.get("/api/v1/courses").json()), 1)
        self.assertEqual(len(student.get("/api/v1/classrooms").json()), 1)
        second = teacher.post(f"/api/v1/courses/{course_id}/classrooms", json={"title": "Lớp B"}).json()["id"]
        self.assertEqual(student.get(f"/api/v1/classrooms/{second}").status_code, 404)
        self.assertEqual(student.post(f"/api/v1/courses/{course_id}/chapters", json={"title": "Sai"}).status_code, 403)
        self.assertEqual(student.post(f"/api/v1/courses/{course_id}/topics", json={"title": "Sai"}).status_code, 403)
        self.assertEqual(student.patch(f"/api/v1/classrooms/{classroom_id}", json={"title": "Sai"}).status_code, 403)
        self.assertEqual(student.get(f"/api/v1/classrooms/{classroom_id}/members").status_code, 403)
        self.assertEqual(student.delete(f"/api/v1/classrooms/{classroom_id}").status_code, 403)
        self.assertEqual(student.post(f"/api/v1/classrooms/{classroom_id}/join-code").status_code, 403)
        self.assertEqual(self.client("teacher2").delete(
            f"/api/v1/classrooms/{classroom_id}/members/{self.ids['student']}"
        ).status_code, 403)
        self.assertEqual(self.client("teacher2").post(f"/api/v1/classrooms/{classroom_id}/join-code").status_code, 403)
        members = teacher.get(f"/api/v1/classrooms/{classroom_id}/members").json()
        self.assertEqual(members[0]["student_id"], str(self.ids["student"]))
        self.assertNotIn("join_code_hash", student.get(f"/api/v1/classrooms/{classroom_id}").json())

    def test_join_code_rotation_pause_and_duplicate_join(self):
        _, classroom_id = self.classroom()
        teacher, student = self.client("teacher"), self.client()
        self.assertEqual(teacher.patch(f"/api/v1/classrooms/{classroom_id}", json={"join_enabled": True}).status_code, 409)
        old_code, code = self.code(classroom_id), self.code(classroom_id)
        self.assertEqual(student.post("/api/v1/classrooms/join", json={"join_code": old_code}).status_code, 404)
        for _ in range(2):
            self.assertEqual(student.post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 200)
        self.assertEqual(teacher.post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 403)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Classroom, classroom_id).join_code_hash, token_hash(code))
            self.assertEqual(len(db.scalars(select(ClassroomMember)).all()), 1)
        self.assertEqual(teacher.patch(f"/api/v1/classrooms/{classroom_id}", json={"join_enabled": False}).status_code, 200)
        self.assertEqual(self.client("other").post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 404)
        self.assertEqual(student.get(f"/api/v1/classrooms/{classroom_id}").status_code, 200)

    def test_leave_remove_and_rejoin_preserve_membership(self):
        course_id, classroom_id = self.classroom()
        teacher, student = self.client("teacher"), self.client()
        self.join(classroom_id)
        self.assertEqual(student.delete(f"/api/v1/classrooms/{classroom_id}/members/me").status_code, 200)
        self.assertEqual(student.get(f"/api/v1/classrooms/{classroom_id}").status_code, 404)
        self.assertEqual(student.get(f"/api/v1/courses/{course_id}").status_code, 404)
        self.assertEqual(student.get("/api/v1/classrooms").json(), [])
        self.assertEqual(teacher.get(f"/api/v1/classrooms/{classroom_id}/members").json(), [])
        history = teacher.get(f"/api/v1/classrooms/{classroom_id}/members?include_left=true").json()
        self.assertIsNotNone(history[0]["left_at"])
        self.join(classroom_id)
        self.assertEqual(student.get(f"/api/v1/classrooms/{classroom_id}").status_code, 200)
        self.assertEqual(teacher.delete(f"/api/v1/classrooms/{classroom_id}/members/{self.ids['student']}").status_code, 200)
        self.assertEqual(student.get(f"/api/v1/courses/{course_id}").status_code, 404)
        with Session(self.engine) as db:
            self.assertEqual(len(db.scalars(select(ClassroomMember)).all()), 1)
            self.assertIsNotNone(db.get(ClassroomMember, (classroom_id, self.ids["student"])).left_at)

    def test_deleted_classroom_and_course_revoke_access(self):
        course_id, classroom_id = self.classroom()
        teacher, student = self.client("teacher"), self.client()
        code = self.code(classroom_id)
        self.assertEqual(student.post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 200)
        self.assertEqual(teacher.delete(f"/api/v1/classrooms/{classroom_id}").status_code, 200)
        self.assertEqual(student.get(f"/api/v1/courses/{course_id}").status_code, 404)
        self.assertEqual(student.post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 404)
        with Session(self.engine) as db:
            self.assertIsNotNone(db.get(Classroom, classroom_id).deleted_at)
            self.assertIsNotNone(db.get(ClassroomMember, (classroom_id, self.ids["student"])))
        second = teacher.post(f"/api/v1/courses/{course_id}/classrooms", json={"title": "Lớp B"}).json()["id"]
        code = self.code(second)
        student.post("/api/v1/classrooms/join", json={"join_code": code})
        self.assertEqual(teacher.delete(f"/api/v1/courses/{course_id}").status_code, 200)
        for client in (teacher, student):
            self.assertEqual(client.get(f"/api/v1/classrooms/{second}").status_code, 404)
            self.assertEqual(client.get("/api/v1/classrooms").json(), [])
        self.assertEqual(student.post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 404)

    def test_validation_origin_and_authentication(self):
        with TestClient(app, headers={"Origin": self.origin}) as anonymous:
            self.assertEqual(anonymous.get("/api/v1/courses").status_code, 401)
            self.assertEqual(anonymous.get("/api/v1/classrooms").status_code, 401)
        client = self.client()
        for body in ({"title": " "}, {"title": "X", "kind": "other"}):
            self.assertEqual(client.post("/api/v1/courses", json=body).status_code, 422)
        self.assertEqual(client.post("/api/v1/courses", json={"title": "X"}, headers={"Origin": "https://evil.example"}).status_code, 403)
        course_id = self.course()
        for body in ({}, {"title": None}, {"kind": "teaching"}, {"owner_id": str(uuid4())}):
            self.assertEqual(client.patch(f"/api/v1/courses/{course_id}", json=body).status_code, 422)
        self.assertEqual(client.post(f"/api/v1/courses/{course_id}/chapters", json={"title": "X", "position": -1}).status_code, 422)
        self.assertEqual(client.get("/api/v1/courses?limit=101").status_code, 422)
        response = client.get("/api/v1/courses")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_concurrent_join_keeps_one_membership(self):
        _, classroom_id = self.classroom()
        code = self.code(classroom_id)
        student = self.client()
        cookie = "; ".join(f"{key}={value}" for key, value in student.cookies.items())

        def join():
            with TestClient(app, headers={"Origin": self.origin, "Cookie": cookie}) as client:
                return client.post("/api/v1/classrooms/join", json={"join_code": code}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _: join(), range(2)))
        self.assertEqual(statuses, [200, 200])
        with Session(self.engine) as db:
            self.assertEqual(len(db.scalars(select(ClassroomMember)).all()), 1)


if __name__ == "__main__":
    unittest.main()
