import secrets
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import jwt
import psycopg
from alembic import command
from alembic.config import Config
from fastapi import Depends, HTTPException
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.rows import dict_row
from pydantic import SecretStr
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.api.dependencies import _attempts, require_roles
from app.core.config import get_settings
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, password_hasher, token_hash
from app.db.connection import get_db, get_engine
from app.main import app


def admin_only(user=Depends(require_roles("admin"))):
    return {"role": user.role}


app.add_api_route("/test/admin-only", admin_only, methods=["GET"])


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = "test_auth_" + uuid4().hex
        settings = get_settings()
        cls.origin = settings.allowed_origins[0]
        cls.secret = secrets.token_urlsafe(48)
        cls.patches = [
            patch.object(settings, "auth_secret", SecretStr(cls.secret)),
            patch.object(settings, "email_verification_required", True),
            patch.object(settings, "cookie_secure", False),
        ]
        for item in cls.patches:
            item.start()
        cls.connection_options = get_engine().url.translate_connect_args(username="user", database="dbname")
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(cls.schema)))
        cls.engine = create_engine(
            get_engine().url, pool_pre_ping=True,
            connect_args={"options": f"-csearch_path={cls.schema}", "connect_timeout": 5},
        )
        cls.migration_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        with cls.engine.begin() as connection:
            cls.migration_config.attributes["connection"] = connection
            command.upgrade(cls.migration_config, "head")
            command.check(cls.migration_config)

        def test_db():
            with Session(cls.engine, expire_on_commit=False) as session, session.begin():
                yield session

        app.dependency_overrides[get_db] = test_db

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        # Chỉ xóa schema riêng do chính lần chạy test này tạo ra.
        if not cls.schema.startswith("test_auth_") or len(cls.schema) != 42:
            raise RuntimeError("Unexpected test schema")
        cls.engine.dispose()
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(cls.schema)))
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        with self.db_connection() as db:
            db.execute("TRUNCATE auth_tokens, auth_sessions, users")
        _attempts.clear()
        self.sent = []
        self.mail_patch = patch("app.services.auth.send_token_email", side_effect=lambda *args: self.sent.append(args))
        self.mail_mock = self.mail_patch.start()
        self.client = TestClient(app, headers={"Origin": self.origin})
        self.email = "student@example.com"
        self.password = "StudyFlow-test-password-1"
        self.addCleanup(self.client.close)
        self.addCleanup(self.mail_patch.stop)

    def db_connection(self):
        db = psycopg.connect(**self.connection_options, row_factory=dict_row)
        db.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
        return db

    def register(self, **extra):
        return self.client.post("/auth/register", json={
            "email": self.email, "password": self.password, "full_name": "Sinh viên", **extra,
        })

    def verified_user(self):
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": self.sent[-1][1]}).status_code, 200)

    def login(self, **extra):
        return self.client.post("/auth/login", json={"email": self.email, "password": self.password, **extra})

    def cookie_header(self):
        return {"Cookie": "; ".join(f"{key}={value}" for key, value in self.client.cookies.items())}

    def test_registration_verification_login_and_profile(self):
        self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.login().status_code, 403)
        token = self.sent[-1][1]
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": token}).status_code, 200)
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": token}).status_code, 400)
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("password_hash", response.json())
        self.assertEqual(response.json()["role"], "student")
        self.assertTrue(all("HttpOnly" in value and "SameSite=lax" in value for value in response.headers.get_list("set-cookie")))
        self.assertEqual(response.headers["cache-control"], "no-store")
        updated = self.client.patch("/users/me", json={"full_name": "  Nguyễn Văn A  "})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["full_name"], "Nguyễn Văn A")
        self.assertEqual(self.client.patch("/users/me", json={"full_name": " "}).status_code, 422)
        with self.db_connection() as db:
            user = db.execute("SELECT * FROM users").fetchone()
            self.assertNotEqual(user["password_hash"], self.password)
            self.assertTrue(password_hasher.verify(self.password, user["password_hash"]))
            stored = db.execute("SELECT token_hash FROM auth_tokens").fetchone()["token_hash"]
            self.assertEqual(stored, token_hash(token))

    def test_duplicate_email_and_no_self_elevation(self):
        self.assertEqual(self.register(role="admin").status_code, 422)
        self.assertEqual(self.register(email="STUDENT@example.com").status_code, 201)
        self.assertEqual(self.register().status_code, 409)
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": self.sent[-1][1]}).status_code, 200)
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.patch("/users/me", json={"full_name": "A", "role": "admin"}).status_code, 422)
        self.assertEqual(self.client.get("/test/admin-only").status_code, 403)
        with self.db_connection() as db:
            db.execute("UPDATE users SET role = 'admin'")
        self.assertEqual(self.client.get("/test/admin-only").status_code, 200)

    def test_refresh_rotation_and_logout_revocation(self):
        self.verified_user()
        self.assertEqual(self.login().status_code, 200)
        old_refresh = self.client.cookies[REFRESH_COOKIE]
        self.assertEqual(self.client.post("/auth/refresh").status_code, 200)
        self.assertNotEqual(old_refresh, self.client.cookies[REFRESH_COOKIE])
        self.assertEqual(self.client.post("/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={old_refresh}"}).status_code, 401)
        valid_cookies = self.cookie_header()
        self.assertEqual(self.client.post("/auth/logout").status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=valid_cookies).status_code, 401)
        self.assertEqual(self.client.post("/auth/refresh", headers=valid_cookies).status_code, 401)
        self.assertNotIn(ACCESS_COOKIE, self.client.cookies)

    def test_expired_tampered_access_and_expired_session(self):
        self.verified_user()
        self.login()
        access = self.client.cookies[ACCESS_COOKIE]
        payload = jwt.decode(access, self.secret, algorithms=["HS256"], audience="studyflow-web")
        payload["iat"] = datetime.now(timezone.utc) - timedelta(hours=2)
        payload["exp"] = datetime.now(timezone.utc) - timedelta(hours=1)
        expired = jwt.encode(payload, self.secret, algorithm="HS256")
        self.assertEqual(self.client.get("/auth/me", headers={"Cookie": f"{ACCESS_COOKIE}={expired}"}).status_code, 401)
        tampered = jwt.encode(payload, secrets.token_urlsafe(48), algorithm="HS256")
        self.assertEqual(self.client.get("/auth/me", headers={"Cookie": f"{ACCESS_COOKIE}={tampered}"}).status_code, 401)
        with self.db_connection() as db:
            db.execute("UPDATE auth_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'")
        self.assertEqual(self.client.get("/auth/me").status_code, 401)
        self.assertEqual(self.client.post("/auth/refresh").status_code, 401)

    def test_reset_password_single_use_and_revokes_all_sessions(self):
        self.verified_user()
        self.login()
        first_session = self.cookie_header()
        self.login()
        second_session = self.cookie_header()
        known = self.client.post("/auth/forgot-password", json={"email": self.email})
        first_token = self.sent[-1][1]
        unknown = self.client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
        self.assertEqual(known.json(), unknown.json())
        self.client.post("/auth/forgot-password", json={"email": self.email})
        token = self.sent[-1][1]
        new_password = "New-studyflow-password-2"
        self.assertEqual(self.client.post("/auth/reset-password", json={"token": first_token, "password": new_password}).status_code, 400)
        reset = {"token": token, "password": new_password}
        self.assertEqual(self.client.post("/auth/reset-password", json=reset).status_code, 200)
        self.assertEqual(self.client.post("/auth/reset-password", json=reset).status_code, 400)
        for cookies in (first_session, second_session):
            self.assertEqual(self.client.get("/auth/me", headers=cookies).status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password=new_password).status_code, 200)

    def test_change_password_and_logout_all(self):
        self.verified_user()
        self.login()
        old_session = self.cookie_header()
        wrong = self.client.post("/auth/change-password", json={"current_password": "wrong", "new_password": "New-password-2"})
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(self.client.get("/auth/me").status_code, 200)
        changed = self.client.post("/auth/change-password", json={"current_password": self.password, "new_password": "New-password-2"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=old_session).status_code, 401)
        self.assertEqual(self.login(password="New-password-2").status_code, 200)
        cookies = self.cookie_header()
        self.login(password="New-password-2")
        self.assertEqual(self.client.post("/auth/logout-all").status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=cookies).status_code, 401)

    def test_expired_email_tokens_and_resend(self):
        self.register()
        expired_token = self.sent[-1][1]
        with self.db_connection() as db:
            db.execute("UPDATE auth_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'")
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": expired_token}).status_code, 400)
        self.client.post("/auth/resend-verification", json={"email": self.email})
        self.assertEqual(self.client.post("/auth/verify-email", json={"token": self.sent[-1][1]}).status_code, 200)
        self.client.post("/auth/forgot-password", json={"email": self.email})
        reset_token = self.sent[-1][1]
        with self.db_connection() as db:
            db.execute("UPDATE auth_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE consumed_at IS NULL")
        self.assertEqual(self.client.post("/auth/reset-password", json={"token": reset_token, "password": "New-password-2"}).status_code, 400)

    def test_locked_account_blocks_existing_session_and_login(self):
        self.verified_user()
        self.login()
        with self.db_connection() as db:
            db.execute("UPDATE users SET status = 'locked'")
        self.assertEqual(self.client.get("/auth/me").status_code, 403)
        self.assertEqual(self.client.post("/auth/refresh").status_code, 403)
        self.assertEqual(self.login().status_code, 403)
        self.assertEqual(self.client.post("/auth/logout").status_code, 200)

    def test_smtp_failure_rolls_back_registration(self):
        self.mail_mock.side_effect = HTTPException(503, "SMTP unavailable")
        self.assertEqual(self.register().status_code, 503)
        with self.db_connection() as db:
            self.assertEqual(db.execute("SELECT count(*) AS count FROM users").fetchone()["count"], 0)
        self.mail_mock.side_effect = lambda *args: self.sent.append(args)
        self.assertEqual(self.register().status_code, 201)

    def test_origin_and_rate_limit(self):
        body = {"email": self.email, "password": self.password}
        self.assertEqual(self.client.post("/auth/login", json=body, headers={"Origin": "https://evil.example"}).status_code, 403)
        with TestClient(app) as client:
            self.assertEqual(client.post("/auth/login", json=body).status_code, 403)
        _attempts.clear()
        for _ in range(20):
            self.assertEqual(self.client.post("/auth/refresh").status_code, 401)
        self.assertEqual(self.client.post("/auth/refresh").status_code, 429)

    def test_concurrent_refresh_only_one_succeeds(self):
        self.verified_user()
        self.login()
        cookies = self.cookie_header()

        def refresh():
            with TestClient(app, headers={"Origin": self.origin, **cookies}) as client:
                return client.post("/auth/refresh").status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(lambda _: refresh(), range(2)))
        self.assertEqual(sorted(statuses), [200, 401])

    def test_health_and_docs(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})
        self.assertEqual(self.client.get("/docs").status_code, 200)
        self.assertEqual(self.client.get("/auth/me").status_code, 401)

    def test_email_verification_can_be_disabled_by_configuration(self):
        with patch.object(get_settings(), "email_verification_required", False):
            self.assertEqual(self.register().status_code, 201)
            self.assertEqual(self.sent, [])
            self.assertEqual(self.login().status_code, 200)
            self.assertEqual(self.client.get("/auth/me").status_code, 200)

    def test_profile_origin_and_cors(self):
        self.verified_user()
        self.login()
        response = self.client.options("/users/me", headers={
            "Origin": self.origin, "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "content-type",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], self.origin)
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")
        self.assertEqual(self.client.patch("/users/me", json={"full_name": "Other"}, headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get("/auth/me").json()["full_name"], "Sinh viên")

    def test_invalid_token_identity_and_logout_after_rate_limit(self):
        self.verified_user()
        self.login()
        access = self.client.cookies[ACCESS_COOKIE]
        payload = jwt.decode(access, self.secret, algorithms=["HS256"], audience="studyflow-web")
        payload["sid"] = 123
        invalid = jwt.encode(payload, self.secret, algorithm="HS256")
        self.assertEqual(self.client.get("/auth/me", headers={"Cookie": f"{ACCESS_COOKIE}={invalid}"}).status_code, 401)
        for _ in range(20):
            self.client.post("/auth/refresh", headers={"Cookie": ""})
        self.assertEqual(self.client.post("/auth/refresh").status_code, 429)
        self.assertEqual(self.client.post("/auth/logout").status_code, 200)

    def test_email_contains_frontend_fragment_link(self):
        from app.services.mail import send_token_email

        with patch("app.services.mail.smtplib.SMTP") as smtp:
            token = secrets.token_urlsafe(48)
            send_token_email(self.email, token, "email_verification")
            message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
            self.assertEqual(message["To"], self.email)
            self.assertIn(f"/verify-email#token={token}", message.get_content())

    def test_migration_roundtrip_and_metadata_match(self):
        with self.engine.begin() as connection:
            self.migration_config.attributes["connection"] = connection
            command.downgrade(self.migration_config, "base")
            self.assertEqual(inspect(connection).get_table_names(), ["alembic_version"])
            command.upgrade(self.migration_config, "head")
            command.check(self.migration_config)
            self.assertEqual(
                set(inspect(connection).get_table_names()),
                {"alembic_version", "users", "auth_sessions", "auth_tokens"},
            )

    def test_upgrade_at_head_preserves_user_and_session(self):
        self.verified_user()
        response = self.login()
        self.assertEqual(response.status_code, 200)
        user_id = response.json()["id"]
        with self.engine.begin() as connection:
            self.migration_config.attributes["connection"] = connection
            command.upgrade(self.migration_config, "head")
            command.check(self.migration_config)
        self.assertEqual(self.client.get("/auth/me").json()["id"], user_id)


if __name__ == "__main__":
    unittest.main()
