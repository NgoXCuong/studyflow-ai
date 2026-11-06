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
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import _attempts
from app.core.config import get_settings
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, password_hasher
from app.db.connection import get_db, get_engine
from app.main import app
from app.models.admin import AdminAuditLog
from app.models.auth import AuthSession, User


class AdminTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = "test_admin_" + uuid4().hex
        settings = get_settings()
        cls.origin = settings.allowed_origins[0]
        cls.patches = [
            patch.object(settings, "auth_secret", SecretStr(secrets.token_urlsafe(48))),
            patch.object(settings, "email_verification_required", False),
            patch.object(settings, "cookie_secure", False),
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
        cls.password = "Admin-tests-password-1"
        cls.password_hash = password_hasher.hash(cls.password)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()
        if not cls.schema.startswith("test_admin_") or len(cls.schema) != 43:
            raise RuntimeError("Unexpected test schema")
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(cls.schema)))
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        _attempts.clear()
        with self.engine.begin() as connection:
            connection.exec_driver_sql(
                "TRUNCATE document_chunks, document_processing_jobs, ai_usage_logs, documents, admin_audit_logs, topics, chapters, classroom_members, classrooms, courses, "
                "auth_tokens, auth_sessions, users"
            )
        self.ids = {}
        with Session(self.engine) as db, db.begin():
            for name, role in (("admin", "admin"), ("otheradmin", "admin"),
                               ("student", "student"), ("teacher", "teacher")):
                user = User(id=uuid4(), email=f"{name}@example.com", full_name=name,
                            password_hash=self.password_hash, role=role)
                db.add(user)
                self.ids[name] = user.id

    def client(self, name="admin"):
        client = TestClient(app, headers={"Origin": self.origin})
        self.addCleanup(client.close)
        response = client.post("/api/v1/auth/login", json={
            "email": f"{name}@example.com", "password": self.password,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return client

    def user_path(self, name="student"):
        return f"/api/v1/admin/users/{self.ids[name]}"

    def logs(self):
        with Session(self.engine) as db:
            return db.scalars(select(AdminAuditLog)).all()

    def test_admin_only_and_origin_required(self):
        with TestClient(app) as guest:
            self.assertEqual(guest.get("/api/v1/admin/users").status_code, 401)
            self.assertEqual(guest.get("/api/v1/admin/audit-logs").status_code, 401)
            self.assertEqual(guest.patch(self.user_path(), headers={"Origin": self.origin},
                                         json={"status": "locked"}).status_code, 401)
        for name in ("student", "teacher"):
            client = self.client(name)
            self.assertEqual(client.get("/api/v1/admin/users").status_code, 403)
            self.assertEqual(client.get("/api/v1/admin/audit-logs").status_code, 403)
            self.assertEqual(client.patch(self.user_path(), json={"role": "teacher"}).status_code, 403)
        client = self.client()
        self.assertEqual(client.patch(self.user_path(), json={"status": "locked"},
                                      headers={"Origin": "https://untrusted.example"}).status_code, 403)
        client.headers.pop("Origin")
        self.assertEqual(client.patch(self.user_path(), json={"status": "locked"}).status_code, 403)
        self.assertEqual(self.logs(), [])

    def test_account_filters_pagination_and_no_secrets(self):
        client = self.client()
        response = client.get("/api/v1/admin/users")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 4)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        for user in response.json():
            self.assertEqual(set(user), {"id", "email", "full_name", "role", "status", "email_verified_at", "created_at"})
        self.assertEqual(len(client.get("/api/v1/admin/users", params={"role": "teacher"}).json()), 1)
        result = client.get("/api/v1/admin/users", params={"q": "  STUDENT@  ", "status": "active"}).json()
        self.assertEqual([row["id"] for row in result], [str(self.ids["student"])])
        for search in ("%", "_", "' OR 1=1 --"):
            self.assertEqual(client.get("/api/v1/admin/users", params={"q": search}).json(), [])
        first = client.get("/api/v1/admin/users", params={"limit": 2}).json()
        second = client.get("/api/v1/admin/users", params={"limit": 2, "offset": 2}).json()
        self.assertEqual(len(first + second), 4)
        self.assertEqual(len({row["id"] for row in first + second}), 4)

    def test_lock_revokes_all_sessions_and_unlock_does_not_restore_them(self):
        admin, first, second = self.client(), self.client("student"), self.client("student")
        response = admin.patch(self.user_path(), json={"status": "locked"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "locked")
        for client in (first, second):
            self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)
            self.assertEqual(client.post("/api/v1/auth/refresh").status_code, 403)
        self.assertEqual(first.post("/api/v1/auth/login", json={
            "email": "student@example.com", "password": self.password,
        }).status_code, 403)
        self.assertEqual(admin.patch(self.user_path(), json={"status": "active"}).status_code, 200)
        for client in (first, second):
            self.assertEqual(client.get("/api/v1/auth/me").status_code, 401)
            self.assertEqual(client.post("/api/v1/auth/refresh").status_code, 401)
        self.assertEqual(self.client("student").get("/api/v1/auth/me").status_code, 200)
        logs = self.logs()
        self.assertEqual(len(logs), 2)
        self.assertEqual({(log.old_status, log.new_status) for log in logs}, {("active", "locked"), ("locked", "active")})
        self.assertTrue(all(log.actor_id == self.ids["admin"] for log in logs))

    def test_role_change_revokes_sessions_and_applies_new_permissions(self):
        admin, student = self.client(), self.client("student")
        response = admin.patch(self.user_path(), json={"role": "teacher"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(student.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(student.post("/api/v1/auth/refresh").status_code, 401)
        teacher = self.client("student")
        self.assertEqual(teacher.get("/api/v1/auth/me").json()["role"], "teacher")
        course = teacher.post("/api/v1/courses", json={"title": "Môn giảng dạy", "kind": "teaching"})
        self.assertEqual(course.status_code, 201, course.text)
        self.assertEqual(admin.patch(self.user_path(), json={"role": "student"}).status_code, 200)
        self.assertEqual(teacher.get("/api/v1/auth/me").status_code, 401)
        student = self.client("student")
        self.assertEqual(student.post("/api/v1/courses", json={"title": "X", "kind": "teaching"}).status_code, 403)
        self.assertEqual(student.patch(f"/api/v1/courses/{course.json()['id']}", json={"title": "X"}).status_code, 403)
        self.assertEqual(student.get(f"/api/v1/courses/{course.json()['id']}").status_code, 200)

    def test_combined_update_is_one_audit_entry(self):
        client = self.client()
        response = client.patch(self.user_path(), json={"status": "locked", "role": "teacher"})
        self.assertEqual(response.status_code, 200)
        log, = self.logs()
        self.assertEqual((log.old_role, log.new_role, log.old_status, log.new_status),
                         ("student", "teacher", "active", "locked"))
        self.assertEqual(log.target_user_id, self.ids["student"])
        self.assertEqual(log.action, "user_updated")

    def test_noop_does_not_revoke_sessions_or_log(self):
        admin, student = self.client(), self.client("student")
        response = admin.patch(self.user_path(), json={"status": "active", "role": "student"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(student.get("/api/v1/auth/me").status_code, 200)
        self.assertEqual(self.logs(), [])

    def test_validation_and_admin_account_protection(self):
        admin = self.client()
        for body in ({}, {"role": None}, {"status": None}, {"role": "admin"}, {"role": "invalid"},
                     {"status": "invalid"}, {"full_name": "X"}, {"password_hash": "X"}):
            with self.subTest(body=body):
                self.assertEqual(admin.patch(self.user_path(), json=body).status_code, 422)
        for name in ("admin", "otheradmin"):
            self.assertEqual(admin.patch(self.user_path(name), json={"status": "locked"}).status_code, 403)
            self.assertEqual(admin.patch(self.user_path(name), json={"role": "student"}).status_code, 403)
        self.assertEqual(admin.patch(f"/api/v1/admin/users/{uuid4()}", json={"status": "locked"}).status_code, 404)
        for params in ({"limit": 0}, {"limit": 101}, {"offset": -1}, {"role": "invalid"}, {"q": "  "}):
            self.assertEqual(admin.get("/api/v1/admin/users", params=params).status_code, 422)
        self.assertEqual(self.logs(), [])

    def test_audit_filters_and_read_only_endpoints(self):
        admin = self.client()
        admin.patch(self.user_path(), json={"status": "locked"})
        self.client("otheradmin").patch(self.user_path("teacher"), json={"status": "locked"})
        response = admin.get("/api/v1/admin/audit-logs", params={
            "actor_id": str(self.ids["admin"]), "target_user_id": str(self.ids["student"]),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["new_status"], "locked")
        log_id = response.json()[0]["id"]
        self.assertEqual(admin.get("/api/v1/admin/audit-logs", params={"target_user_id": str(uuid4())}).json(), [])
        self.assertEqual(len(admin.get("/api/v1/admin/audit-logs", params={"limit": 1, "offset": 1}).json()), 1)
        for method, path in (("POST", "/api/v1/admin/audit-logs"),
                             ("PATCH", f"/api/v1/admin/audit-logs/{log_id}"),
                             ("DELETE", f"/api/v1/admin/audit-logs/{log_id}")):
            self.assertIn(admin.request(method, path).status_code, (404, 405))

    def test_audit_failure_rolls_back_account_and_revocations(self):
        admin, student = self.client(), self.client("student")
        with patch("app.services.admin.AdminAuditLog", side_effect=RuntimeError("Test audit failure")):
            with self.assertRaisesRegex(RuntimeError, "Test audit failure"):
                admin.patch(self.user_path(), json={"role": "teacher", "status": "locked"})
        self.assertEqual(student.get("/api/v1/auth/me").status_code, 200)
        self.assertEqual(student.get("/api/v1/auth/me").json()["role"], "student")
        self.assertEqual(self.logs(), [])

    def test_concurrent_same_change_logs_once(self):
        admin = self.client()
        self.client("student")
        cookies = {name: admin.cookies.get(name) for name in (ACCESS_COOKIE, REFRESH_COOKIE)}

        def lock():
            with TestClient(app, headers={"Origin": self.origin}, cookies=cookies) as client:
                return client.patch(self.user_path(), json={"status": "locked"}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertEqual(list(executor.map(lambda _: lock(), range(2))), [200, 200])
        self.assertEqual(len(self.logs()), 1)
        with Session(self.engine) as db:
            active_sessions = db.scalar(select(func.count()).select_from(AuthSession).where(
                AuthSession.user_id == self.ids["student"], AuthSession.revoked_at.is_(None),
            ))
            self.assertEqual(active_sessions, 0)


if __name__ == "__main__":
    unittest.main()
