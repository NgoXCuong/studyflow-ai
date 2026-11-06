import secrets
import unittest
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

import psycopg
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic import SecretStr
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from app.api.dependencies import _attempts
from app.core.config import get_settings
from app.core.security import password_hasher
from app.db.connection import get_db, get_engine
from app.main import app
from app.models.auth import User
from app.models.documents import Document
from app.services.documents import upload_document
from app.services.document_cleanup import cleanup_documents


def pdf_bytes(*, text=True, pages=1, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=200, height=200)
        if text:
            font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                     NameObject("/Subtype"): NameObject("/Type1"),
                                     NameObject("/BaseFont"): NameObject("/Helvetica")})
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
            })
            stream = DecodedStreamObject()
            stream.set_data(b"BT /F1 12 Tf 20 100 Td (StudyFlow test document) Tj ET")
            page.replace_contents(stream)
    if encrypted:
        writer.encrypt("test-only-password")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class DocumentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = "test_documents_" + uuid4().hex
        cls.settings = get_settings()
        cls.origin = cls.settings.allowed_origins[0]
        cls.temp_dir = TemporaryDirectory(prefix="studyflow-documents-")
        cls.storage = Path(cls.temp_dir.name)
        cls.patches = [
            patch.object(cls.settings, "auth_secret", SecretStr(secrets.token_urlsafe(48))),
            patch.object(cls.settings, "email_verification_required", False),
            patch.object(cls.settings, "cookie_secure", False),
            patch.object(cls.settings, "document_storage_dir", cls.storage),
            patch.object(cls.settings, "document_storage_backend", "local"),
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
        cls.password = "Document-tests-password-1"
        cls.password_hash = password_hasher.hash(cls.password)
        cls.pdf = pdf_bytes()

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()
        if not cls.schema.startswith("test_documents_") or len(cls.schema) != 47:
            raise RuntimeError("Unexpected test schema")
        with psycopg.connect(**cls.connection_options) as db:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(cls.schema)))
        for item in reversed(cls.patches):
            item.stop()
        cls.temp_dir.cleanup()

    def setUp(self):
        _attempts.clear()
        with self.engine.begin() as connection:
            connection.exec_driver_sql(
                "TRUNCATE document_chunks, document_processing_jobs, ai_usage_logs, documents, admin_audit_logs, topics, chapters, classroom_members, classrooms, "
                "courses, auth_tokens, auth_sessions, users"
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
            result = client.post("/api/v1/auth/login", json={
                "email": f"{name}@example.com", "password": self.password,
            })
            self.assertEqual(result.status_code, 200, result.text)
            self.clients[name] = client
        return self.clients[name]

    def course(self, name="student"):
        response = self.client(name).post("/api/v1/courses", json={
            "title": "Môn kiểm thử", "kind": "teaching" if name.startswith("teacher") else "personal",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def classroom(self):
        course = self.course("teacher")
        result = self.client("teacher").post(f"/api/v1/courses/{course}/classrooms", json={"title": "Lớp 1"})
        self.assertEqual(result.status_code, 201)
        return course, result.json()["id"]

    def join(self, classroom):
        code = self.client("teacher").post(f"/api/v1/classrooms/{classroom}/join-code").json()["join_code"]
        self.assertEqual(self.client().post("/api/v1/classrooms/join", json={"join_code": code}).status_code, 200)

    def upload(self, course, *, name="student", content=None, filename="source.pdf", mime="application/pdf", **fields):
        return self.client(name).post(f"/api/v1/courses/{course}/documents", data={"title": "  Tài liệu mẫu  ", **fields},
                                      files={"file": (filename, self.pdf if content is None else content, mime)})

    def test_upload_metadata_and_protected_file(self):
        course = self.course()
        response = self.upload(course)
        self.assertEqual(response.status_code, 201, response.text)
        document = response.json()
        self.assertEqual(document["title"], "Tài liệu mẫu")
        self.assertEqual((document["status"], document["page_count"], document["size_bytes"]), ("queued", 1, len(self.pdf)))
        self.assertIsNone(document["published_at"])
        self.assertNotIn("storage_key", document)
        self.assertNotIn("deleted_at", document)
        url = f"/api/v1/documents/{document['id']}"
        self.assertEqual(self.client().get(url).status_code, 200)
        result = self.client().get(url + "/file")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.content, self.pdf)
        self.assertEqual(result.headers["Content-Type"], "application/pdf")
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.assertIn("inline", result.headers["Content-Disposition"])
        self.assertEqual(result.headers["X-Content-Type-Options"], "nosniff")
        partial = self.client().get(url + "/file", headers={"Range": "bytes=0-4"})
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(partial.content, b"%PDF-")

    def test_personal_document_isolation_and_no_public_storage_route(self):
        course = self.course()
        document = self.upload(course).json()
        url = f"/api/v1/documents/{document['id']}"
        with TestClient(app) as guest:
            self.assertEqual(guest.get(url + "/file").status_code, 401)
        for name in ("other", "teacher", "admin"):
            client = self.client(name)
            self.assertEqual(client.get(url).status_code, 404)
            self.assertEqual(client.get(url + "/file").status_code, 404)
            self.assertEqual(client.patch(url, json={"title": "X"}).status_code, 403)
            self.assertEqual(client.delete(url).status_code, 403)
            self.assertEqual(self.upload(course, name=name).status_code, 403)
        with Session(self.engine) as db:
            key = db.get(Document, document["id"]).storage_key
        self.assertEqual(self.client().get(f"/storage/documents/{key}").status_code, 404)

    def test_class_publication_membership_and_classroom_isolation(self):
        course, classroom = self.classroom()
        self.join(classroom)
        teacher, student = self.client("teacher"), self.client()
        document = self.upload(course, name="teacher", classroom_id=classroom).json()
        url = f"/api/v1/documents/{document['id']}"
        self.assertEqual(student.get(f"/api/v1/courses/{course}/documents").json(), [])
        self.assertEqual(student.get(url + "/file").status_code, 404)
        self.assertEqual(teacher.get(url + "/file").status_code, 200)
        self.assertEqual(teacher.patch(url, json={"published": True}).status_code, 200)
        published = teacher.get(url).json()["published_at"]
        self.assertEqual(teacher.patch(url, json={"published": True}).json()["published_at"], published)
        self.assertEqual(student.get(url + "/file").status_code, 200)
        self.assertEqual(student.patch(url, json={"published": False}).status_code, 403)
        second_class = teacher.post(f"/api/v1/courses/{course}/classrooms", json={"title": "Lớp 2"}).json()["id"]
        second = self.upload(course, name="teacher", classroom_id=second_class).json()["id"]
        teacher.patch(f"/api/v1/documents/{second}", json={"published": True})
        self.assertEqual(student.get(f"/api/v1/documents/{second}/file").status_code, 404)
        self.assertEqual(len(student.get(f"/api/v1/courses/{course}/documents").json()), 1)
        self.assertEqual(self.client("teacher2").get(url + "/file").status_code, 404)
        self.assertEqual(self.client("admin").get(url + "/file").status_code, 404)
        teacher.patch(url, json={"published": False})
        self.assertEqual(student.get(url).status_code, 404)
        teacher.patch(url, json={"published": True})
        student.delete(f"/api/v1/classrooms/{classroom}/members/me")
        self.assertEqual(student.get(url + "/file").status_code, 404)

    def test_soft_delete_preserves_file_and_blocks_access(self):
        course = self.course()
        document = self.upload(course).json()
        url = f"/api/v1/documents/{document['id']}"
        self.assertEqual(self.client().delete(url).status_code, 200)
        self.assertEqual(self.client().get(url).status_code, 404)
        self.assertEqual(self.client().get(url + "/file").status_code, 404)
        self.assertEqual(self.client().patch(url, json={"title": "X"}).status_code, 404)
        self.assertEqual(self.client().get(f"/api/v1/courses/{course}/documents").json(), [])
        with Session(self.engine) as db:
            stored = db.get(Document, document["id"])
            self.assertIsNotNone(stored.deleted_at)
            self.assertTrue((self.storage / stored.storage_key).is_file())

    def test_deleted_course_or_classroom_removes_file_access(self):
        course, classroom = self.classroom()
        document = self.upload(course, name="teacher", classroom_id=classroom).json()["id"]
        self.client("teacher").delete(f"/api/v1/classrooms/{classroom}")
        self.assertEqual(self.client("teacher").get(f"/api/v1/documents/{document}/file").status_code, 404)
        self.assertEqual(self.client("teacher").get(f"/api/v1/courses/{course}/documents").json(), [])
        course = self.course()
        document = self.upload(course).json()["id"]
        self.client().delete(f"/api/v1/courses/{course}")
        self.assertEqual(self.client().get(f"/api/v1/documents/{document}/file").status_code, 404)

    def test_file_validation_and_limits(self):
        course = self.course()
        for content, filename, mime, status in [
            (b"text", "source.txt", "text/plain", 415),
            (self.pdf, "source.pdf", "text/plain", 415),
            (b"", "empty.pdf", "application/pdf", 422),
            (b"not a PDF", "fake.pdf", "application/pdf", 422),
            (b"%PDF-1.7\nbroken", "broken.pdf", "application/pdf", 422),
            (pdf_bytes(text=False), "scan.pdf", "application/pdf", 422),
            (pdf_bytes(encrypted=True), "locked.pdf", "application/pdf", 422),
        ]:
            with self.subTest(filename=filename):
                response = self.upload(course, content=content, filename=filename, mime=mime)
                self.assertEqual(response.status_code, status, response.text)
        with patch.object(self.settings, "document_max_pages", 1):
            self.assertEqual(self.upload(course, content=pdf_bytes(pages=2)).status_code, 413)
        with patch.object(self.settings, "document_max_size_bytes", len(self.pdf) - 1):
            self.assertEqual(self.upload(course).status_code, 413)
        with patch.object(self.settings, "document_max_size_bytes", len(self.pdf)):
            self.assertEqual(self.upload(course).status_code, 201)

    def test_body_limit_checks_declared_and_chunked_uploads(self):
        course = self.course()
        with patch.object(self.settings, "document_max_size_bytes", 128):
            url = f"/api/v1/courses/{course}/documents"
            response = self.client().post(url, content=b"x" * (128 + 65537),
                                           headers={"Content-Type": "multipart/form-data; boundary=b"})
            self.assertEqual(response.status_code, 413, response.text)
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], self.origin)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            def chunks():
                yield b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.pdf\"\r\n\r\n"
                yield b"x" * (128 + 65537)
            response = self.client().post(url, content=chunks(),
                                           headers={"Content-Type": "multipart/form-data; boundary=b"})
            self.assertEqual(response.status_code, 413, response.text)

    def test_cross_course_metadata_and_scope_validation(self):
        course, classroom = self.classroom()
        teacher = self.client("teacher")
        another = self.course("teacher")
        chapter = teacher.post(f"/api/v1/courses/{another}/chapters", json={"title": "Khác môn"}).json()["id"]
        self.assertEqual(self.upload(course, name="teacher").status_code, 422)
        self.assertEqual(self.upload(another, name="teacher", classroom_id=classroom).status_code, 404)
        self.assertEqual(self.upload(course, name="teacher", classroom_id=classroom, chapter_id=chapter).status_code, 404)
        personal = self.course()
        self.assertEqual(self.upload(personal, classroom_id=classroom).status_code, 403)
        document = self.upload(personal).json()["id"]
        self.assertEqual(self.client().patch(f"/api/v1/documents/{document}", json={"published": True}).status_code, 422)

    def test_rename_filter_chapter_assignment_and_delete_conflict(self):
        course = self.course()
        client = self.client()
        chapter = client.post(f"/api/v1/courses/{course}/chapters", json={"title": "Chương 1"}).json()["id"]
        document = self.upload(course, chapter_id=chapter).json()["id"]
        url = f"/api/v1/documents/{document}"
        self.assertEqual(client.patch(url, json={"title": "  Tài liệu SQL  "}).json()["title"], "Tài liệu SQL")
        result = client.get(f"/api/v1/courses/{course}/documents", params={"q": "sql", "chapter_id": chapter})
        self.assertEqual([row["id"] for row in result.json()], [document])
        self.assertEqual(client.get(f"/api/v1/courses/{course}/documents", params={"q": "%"}).json(), [])
        self.assertEqual(len(client.get(f"/api/v1/courses/{course}/documents", params={"q": "SOURCE.PDF"}).json()), 1)
        for params in ({"q": "   "}, {"limit": 0}, {"offset": -1}):
            self.assertEqual(client.get(f"/api/v1/courses/{course}/documents", params=params).status_code, 422)
        self.assertEqual(client.delete(f"/api/v1/courses/{course}/chapters/{chapter}").status_code, 409)
        self.assertEqual(client.patch(url, json={"chapter_id": None}).status_code, 200)
        self.assertEqual(client.delete(f"/api/v1/courses/{course}/chapters/{chapter}").status_code, 200)

    def test_origin_and_client_cannot_set_status_or_storage(self):
        course = self.course()
        client = self.client()
        response = client.post(f"/api/v1/courses/{course}/documents", data={"title": "X"},
                               files={"file": ("x.pdf", self.pdf, "application/pdf")}, headers={"Origin": "https://other.example"})
        self.assertEqual(response.status_code, 403)
        document = self.upload(course).json()["id"]
        for body in ({}, {"title": " "}, {"published": None}, {"status": "ready"},
                     {"storage_key": "../private.pdf"}, {"owner_id": str(self.ids["other"])}):
            self.assertEqual(client.patch(f"/api/v1/documents/{document}", json=body).status_code, 422)

    def test_untrusted_filename_and_missing_file(self):
        course = self.course()
        document = self.upload(course, filename="../../source.pdf").json()
        self.assertEqual(document["original_filename"], "source.pdf")
        with Session(self.engine) as db:
            stored = db.get(Document, document["id"])
            self.assertEqual(Path(stored.storage_key).name, stored.storage_key)
            (self.storage / stored.storage_key).unlink()
        response = self.client().get(f"/api/v1/documents/{document['id']}/file")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(str(self.storage), response.text)

    def test_storage_failure_leaves_no_metadata(self):
        course = self.course()
        with patch("app.services.document_storage.Path.mkdir", side_effect=PermissionError("test storage failure")):
            self.assertEqual(self.upload(course).status_code, 503)
        self.assertEqual(self.client().get(f"/api/v1/courses/{course}/documents").json(), [])

    def test_metadata_commit_failure_cleans_new_file(self):
        course = self.course()
        before = set(self.storage.iterdir())
        def failing_upload(db, *args):
            document = upload_document(db, *args)
            def fail_commit(session):
                raise RuntimeError("Test metadata commit failure")
            event.listen(db, "before_commit", fail_commit, once=True)
            return document
        with patch("app.api.routes.documents.documents.upload_document", side_effect=failing_upload):
            with self.assertRaisesRegex(RuntimeError, "Test metadata commit failure"):
                self.upload(course)
        self.assertEqual(set(self.storage.iterdir()), before)
        self.assertEqual(self.client().get(f"/api/v1/courses/{course}/documents").json(), [])

    def test_quota_includes_soft_deleted_files_until_cleanup(self):
        course = self.course()
        with patch.object(self.settings, "document_user_quota_bytes", len(self.pdf)):
            document = self.upload(course).json()
            self.assertEqual(self.upload(course).status_code, 413)
            self.assertEqual(self.client().delete(f"/api/v1/documents/{document['id']}").status_code, 200)
            self.assertEqual(self.upload(course).status_code, 413)
            with patch.object(self.settings, "document_retention_days", 0):
                with Session(self.engine) as db, db.begin():
                    self.assertEqual(cleanup_documents(db), (1, 0))
                    stored = db.get(Document, document["id"])
                    self.assertTrue((self.storage / stored.storage_key).is_file())
                    self.assertIsNone(stored.storage_deleted_at)
                with Session(self.engine) as db, db.begin():
                    self.assertEqual(cleanup_documents(db, apply=True), (1, 0))
                with Session(self.engine) as db, db.begin():
                    self.assertEqual(cleanup_documents(db, apply=True), (0, 0))
            self.assertEqual(self.upload(course).status_code, 201)

    def test_r2_commit_failure_cleans_uploaded_object(self):
        course = self.course()
        client = self.client()
        def failing_upload(db, *args):
            document = upload_document(db, *args)
            def fail_commit(session):
                raise RuntimeError("Test R2 commit failure")
            event.listen(db, "before_commit", fail_commit, once=True)
            return document
        with patch.object(self.settings, "document_storage_backend", "r2"), \
                patch("app.services.document_storage.r2_client") as remote, \
                patch("app.api.routes.documents.documents.upload_document", side_effect=failing_upload):
            with self.assertRaisesRegex(RuntimeError, "Test R2 commit failure"):
                client.post(f"/api/v1/courses/{course}/documents", data={"title": "R2"},
                            files={"file": ("test.pdf", self.pdf, "application/pdf")})
            key = remote.return_value.put_object.call_args.kwargs["Key"]
            self.assertEqual(remote.return_value.delete_object.call_args.kwargs["Key"], key)
        self.assertEqual(client.get(f"/api/v1/courses/{course}/documents").json(), [])

    def test_cleanup_retention_and_retry_after_storage_failure(self):
        course = self.course()
        document = self.upload(course).json()
        self.client().delete(f"/api/v1/documents/{document['id']}")
        with patch.object(self.settings, "document_retention_days", 7):
            with Session(self.engine) as db, db.begin():
                self.assertEqual(cleanup_documents(db, apply=True), (0, 0))
        with patch.object(self.settings, "document_retention_days", 0):
            with patch("app.services.document_cleanup.delete_file", side_effect=OSError("unavailable")):
                with self.assertLogs("app.services.document_cleanup", level="ERROR"):
                    with Session(self.engine) as db, db.begin():
                        self.assertEqual(cleanup_documents(db, apply=True), (0, 1))
                        self.assertIsNone(db.get(Document, document["id"]).storage_deleted_at)
            with Session(self.engine) as db, db.begin():
                self.assertEqual(cleanup_documents(db, apply=True), (1, 0))

    def test_concurrent_quota_check_across_courses(self):
        courses = [self.course(), self.course()]
        cookies = dict(self.client().cookies)
        def upload(course):
            with TestClient(app, headers={"Origin": self.origin}, cookies=cookies) as client:
                return client.post(f"/api/v1/courses/{course}/documents", data={"title": "Quota"},
                                   files={"file": ("same.pdf", self.pdf, "application/pdf")}).status_code
        with patch.object(self.settings, "document_user_quota_bytes", len(self.pdf)):
            with ThreadPoolExecutor(max_workers=2) as executor:
                statuses = list(executor.map(upload, courses))
        self.assertEqual(sorted(statuses), [201, 413])

    def test_cleanup_includes_deleted_courses_and_classrooms(self):
        personal = self.course()
        self.upload(personal)
        self.client().delete(f"/api/v1/courses/{personal}")
        course, classroom = self.classroom()
        self.upload(course, name="teacher", classroom_id=classroom)
        self.client("teacher").delete(f"/api/v1/classrooms/{classroom}")
        with patch.object(self.settings, "document_retention_days", 0):
            with Session(self.engine) as db, db.begin():
                self.assertEqual(cleanup_documents(db, apply=True), (2, 0))

    def test_concurrent_uploads_use_different_files(self):
        course = self.course()
        client = self.client()
        cookies = dict(client.cookies)
        def upload():
            with TestClient(app, headers={"Origin": self.origin}, cookies=cookies) as separate:
                response = separate.post(f"/api/v1/courses/{course}/documents", data={"title": "Cùng tên"},
                                         files={"file": ("same.pdf", self.pdf, "application/pdf")})
                self.assertEqual(response.status_code, 201, response.text)
                return response.json()["id"]
        with ThreadPoolExecutor(max_workers=2) as executor:
            ids = list(executor.map(lambda _: upload(), range(2)))
        self.assertNotEqual(*ids)
        with Session(self.engine) as db:
            documents = db.scalars(select(Document)).all()
            self.assertEqual(len({document.storage_key for document in documents}), 2)
            self.assertTrue(all((self.storage / document.storage_key).read_bytes() == self.pdf for document in documents))


if __name__ == "__main__":
    unittest.main()
