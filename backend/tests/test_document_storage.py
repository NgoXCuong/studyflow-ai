import asyncio
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError, EndpointConnectionError
from botocore.response import StreamingBody
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.services import document_storage as storage
from app.api.dependencies import get_current_user
from app.db.connection import get_db
from app.main import app


class R2ClientTests(unittest.TestCase):
    def tearDown(self):
        storage.r2_client.cache_clear()

    def test_missing_configuration_fails_without_network(self):
        settings = Settings(_env_file=None, r2_account_id="")
        with patch.object(storage, "get_settings", return_value=settings):
            with self.assertRaises(HTTPException) as raised:
                storage.r2_client()
        self.assertEqual(raised.exception.status_code, 503)

    def test_sdk_configuration_can_construct_client_without_network(self):
        settings = Settings(_env_file=None, r2_account_id="a" * 32, r2_bucket_name="test-private",
                            r2_access_key_id=SecretStr("test-access"),
                            r2_secret_access_key=SecretStr("test-secret"))
        with patch.object(storage, "get_settings", return_value=settings):
            client = storage.r2_client()
        self.assertEqual(client.meta.endpoint_url, f"https://{'a' * 32}.r2.cloudflarestorage.com")
        self.assertEqual(client.meta.config.signature_version, "s3v4")
        self.assertEqual(client.meta.config.request_checksum_calculation, "when_required")
        client.close()


class DocumentStorageTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings = Settings(_env_file=None, document_storage_dir=Path(self.directory.name))
        self.settings_patch = patch.object(storage, "get_settings", return_value=self.settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.client = Mock()
        self.client_patch = patch.object(storage, "r2_client", return_value=self.client)
        self.client_patch.start()
        self.addCleanup(self.client_patch.stop)

    def document(self, key="r2/test.pdf"):
        return SimpleNamespace(storage_key=key, original_filename="Tài liệu.pdf", size_bytes=10)

    def error(self, status):
        return ClientError({"Error": {"Code": str(status)},
                            "ResponseMetadata": {"HTTPStatusCode": status}}, "GetObject")

    def test_local_round_trip_and_read_after_switching_to_r2(self):
        key = storage.store_file(b"%PDF-test")
        self.assertNotIn("/", key)
        self.assertEqual((Path(self.directory.name) / key).read_bytes(), b"%PDF-test")
        self.settings.document_storage_backend = "r2"
        response = storage.file_response(self.document(key))
        self.assertEqual(response.status_code, 200)
        self.client.get_object.assert_not_called()
        storage.delete_file(key)
        storage.delete_file(key)
        self.assertFalse((Path(self.directory.name) / key).exists())

    def test_local_traversal_and_missing_file(self):
        for key in ("../secret.pdf", "missing.pdf"):
            with self.assertRaises(HTTPException) as raised:
                storage.file_response(self.document(key))
            self.assertEqual(raised.exception.status_code, 404)

    def test_r2_upload_uses_private_metadata_without_local_copy(self):
        self.settings.document_storage_backend = "r2"
        self.settings.r2_bucket_name = "private-documents"
        key = storage.store_file(b"%PDF-test")
        self.assertTrue(key.startswith("r2/"))
        self.client.put_object.assert_called_once_with(
            Bucket="private-documents", Key=key, Body=b"%PDF-test",
            ContentType="application/pdf", CacheControl="private, no-store",
        )
        self.assertEqual(list(Path(self.directory.name).iterdir()), [])

    def test_r2_upload_failure_attempts_cleanup_and_returns_safe_error(self):
        self.settings.document_storage_backend = "r2"
        self.client.put_object.side_effect = EndpointConnectionError(endpoint_url="https://private.invalid")
        with self.assertRaises(HTTPException) as raised:
            storage.store_file(b"pdf")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertNotIn("private.invalid", raised.exception.detail)
        self.client.delete_object.assert_called_once()

    def test_r2_full_and_partial_responses_stream_and_close_body(self):
        for partial in (False, True):
            with self.subTest(partial=partial):
                content = b"%PDF-" if partial else b"%PDF-test!"
                raw = BytesIO(content)
                body = StreamingBody(raw, len(content))
                result = {"Body": body, "ContentLength": len(content)}
                if partial:
                    result["ContentRange"] = "bytes 0-4/10"
                self.client.get_object.return_value = result
                response = storage.file_response(self.document(), "bytes=0-4" if partial else None)

                async def consume():
                    return b"".join([part async for part in response.body_iterator])

                self.assertEqual(asyncio.run(consume()), content)
                self.assertTrue(raw.closed)
                self.assertEqual(response.status_code, 206 if partial else 200)
                self.assertEqual(response.headers["cache-control"], "no-store")
                self.assertIn("filename*=utf-8''", response.headers["content-disposition"])
                params = self.client.get_object.call_args.kwargs
                self.assertEqual(params.get("Range"), "bytes=0-4" if partial else None)

    def test_r2_errors_and_multiple_ranges(self):
        for status, expected in ((404, 404), (416, 416), (403, 503), (500, 503)):
            self.client.get_object.side_effect = self.error(status)
            with self.assertRaises(HTTPException) as raised:
                storage.file_response(self.document(), "bytes=99-100")
            self.assertEqual(raised.exception.status_code, expected)
        self.client.get_object.reset_mock()
        with self.assertRaises(HTTPException) as raised:
            storage.file_response(self.document(), "bytes=0-1,4-5")
        self.assertEqual(raised.exception.status_code, 416)
        self.client.get_object.assert_not_called()

    def test_cleanup_failure_does_not_hide_original_error(self):
        self.client.delete_object.side_effect = self.error(503)
        with self.assertLogs(storage.logger, level="ERROR"):
            storage.cleanup_file("r2/test.pdf")

    def test_file_api_checks_permission_before_contacting_r2(self):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="test-user")
        app.dependency_overrides[get_db] = lambda: Mock()
        self.addCleanup(app.dependency_overrides.pop, get_current_user)
        self.addCleanup(app.dependency_overrides.pop, get_db)
        url = "/api/v1/documents/55555555-5555-4555-8555-555555555555/file"
        with patch("app.api.routes.documents.documents.get_document", side_effect=HTTPException(404, "Denied")):
            with TestClient(app) as client:
                self.assertEqual(client.get(url).status_code, 404)
        self.client.get_object.assert_not_called()
        raw = BytesIO(b"%PDF-")
        self.client.get_object.return_value = {
            "Body": StreamingBody(raw, 5), "ContentLength": 5, "ContentRange": "bytes 0-4/10",
        }
        with patch("app.api.routes.documents.documents.get_document", return_value=self.document()):
            with TestClient(app) as client:
                response = client.get(url, headers={"Range": "bytes=0-4"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"%PDF-")
        self.assertEqual(response.headers["Content-Range"], "bytes 0-4/10")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertTrue(raw.closed)


if __name__ == "__main__":
    unittest.main()
