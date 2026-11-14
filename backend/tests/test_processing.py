import json
import math
import unittest
from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import MagicMock, Mock, patch
from uuid import UUID

import httpx
import pypdfium2 as pdfium
from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import SecretStr
from pypdf import PdfReader, PdfWriter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import test_documents
from app.core.config import get_settings
from app.models.documents import Document
from app.models.processing import AIUsageLog, DocumentChunk, DocumentProcessingJob
from app.services.document_cleanup import cleanup_documents
from app.services.document_processing import claim_job, extract_chunks, finish_job, process_once, renew_claim
from app.services.document_ocr import ocr_page, open_ocr_engine
from app.services.embeddings import EmbeddingError, embed_batch


def scanned_pdf():
    output = BytesIO()
    with Image.new("RGB", (1200, 1600), "white") as image:
        ImageDraw.Draw(image).multiline_text((80, 120),
            "StudyFlow supports learning from documents.\nPractice helps students review their knowledge.",
            fill="black", font=ImageFont.load_default(size=36), spacing=25)
        image.save(output, format="PDF", resolution=144)
    return output.getvalue()


class OCRTests(unittest.TestCase):
    def test_text_pdf_uses_existing_extraction_without_loading_ocr(self):
        with patch("app.services.document_processing.open_ocr_engine") as engine:
            chunks, pages = extract_chunks(test_documents.pdf_bytes())
        self.assertEqual((pages, len(chunks)), (1, 1))
        self.assertIn("StudyFlow", chunks[0]["content"])
        engine.assert_not_called()

    def test_mixed_pdf_ocr_preserves_page_numbers_and_renews_lease(self):
        writer = PdfWriter()
        writer.add_page(PdfReader(BytesIO(test_documents.pdf_bytes())).pages[0])
        writer.add_page(PdfReader(BytesIO(scanned_pdf())).pages[0])
        writer.add_page(PdfReader(BytesIO(test_documents.pdf_bytes())).pages[0])
        output = BytesIO()
        writer.write(output)
        heartbeat = Mock()
        with patch("app.services.document_processing.open_ocr_engine", return_value=MagicMock()) as engine, \
                patch("app.services.document_processing.ocr_page", return_value="Kiến thức từ bản scan.\x00\nÔn tập.") as recognize:
            chunks, pages = extract_chunks(output.getvalue(), heartbeat=heartbeat)
        self.assertEqual(pages, 3)
        self.assertEqual([chunk["page_number"] for chunk in chunks], [1, 2, 3])
        self.assertEqual(chunks[1]["content"], "Kiến thức từ bản scan. Ôn tập.")
        self.assertEqual([chunk["position"] for chunk in chunks], [0, 1, 2])
        self.assertEqual(recognize.call_args.args[1], 1)
        engine.assert_called_once()
        heartbeat.assert_called_once()

    def test_empty_ocr_result_and_chunk_limit_are_reported(self):
        with patch("app.services.document_processing.open_ocr_engine", return_value=MagicMock()), \
                patch("app.services.document_processing.ocr_page", return_value=" \x00\n"):
            with self.assertRaises(EmbeddingError) as raised:
                extract_chunks(test_documents.pdf_bytes(text=False))
        self.assertEqual(raised.exception.code, "empty_pdf")
        with patch("app.services.document_processing.open_ocr_engine", return_value=MagicMock()), \
                patch("app.services.document_processing.ocr_page", return_value="scan " * 1000), \
                patch.object(get_settings(), "document_max_chunks", 1):
            with self.assertRaises(EmbeddingError) as raised:
                extract_chunks(test_documents.pdf_bytes(text=False))
        self.assertEqual(raised.exception.code, "chunk_limit")

    def test_missing_or_invalid_language_data_has_actionable_error(self):
        with patch("app.services.document_ocr.Path.is_file", return_value=False):
            with self.assertRaises(EmbeddingError) as raised:
                open_ocr_engine()
            self.assertEqual(raised.exception.code, "ocr_not_configured")
        with patch("app.services.document_ocr.Path.is_file", return_value=True), \
                patch("app.services.document_ocr.PyTessBaseAPI", side_effect=RuntimeError("private native detail")):
            with self.assertRaises(EmbeddingError) as raised:
                open_ocr_engine()
        self.assertEqual(raised.exception.code, "ocr_not_configured")
        self.assertNotIn("private", str(raised.exception))

    def test_recognition_failure_clears_engine_and_hides_native_error(self):
        for result, expected in [(False, "ocr_failed"), (RuntimeError("private native detail"), "ocr_failed")]:
            engine = Mock()
            if isinstance(result, Exception):
                engine.Recognize.side_effect = result
            else:
                engine.Recognize.return_value = result
            with pdfium.PdfDocument(test_documents.pdf_bytes(text=False)) as document:
                with self.assertRaises(EmbeddingError) as raised:
                    ocr_page(document, 0, engine)
            self.assertEqual(raised.exception.code, expected)
            self.assertNotIn("private", str(raised.exception))
            engine.Clear.assert_called_once()
            engine.Recognize.assert_called_once_with(timeout=get_settings().ocr_timeout_seconds * 1000)

    def test_recognition_timeout_is_reported(self):
        engine = Mock()
        engine.Recognize.return_value = False
        with pdfium.PdfDocument(test_documents.pdf_bytes(text=False)) as document, \
                patch("app.services.document_ocr.time.monotonic", side_effect=[0, get_settings().ocr_timeout_seconds]):
            with self.assertRaises(EmbeddingError) as raised:
                ocr_page(document, 0, engine)
        self.assertEqual(raised.exception.code, "ocr_timeout")
        engine.Clear.assert_called_once()

    def test_large_page_render_is_bounded(self):
        page = MagicMock()
        page.get_size.return_value = (20_000, 20_000)
        engine = Mock()
        engine.GetUTF8Text.return_value = "Text"
        self.assertEqual(ocr_page([page], 0, engine), "Text")
        scale = page.render.call_args.kwargs["scale"]
        self.assertLessEqual((20_000 * scale) ** 2, 16_000_000)
        page.close.assert_called_once()


class EmbeddingTests(unittest.TestCase):
    def setUp(self):
        provider_patch = patch.object(get_settings(), "embedding_provider", "gemini")
        provider_patch.start()
        self.addCleanup(provider_patch.stop)
        self.key_patch = patch.object(get_settings(), "gemini_api_key", SecretStr("test-key-only"))
        self.key_patch.start()
        self.addCleanup(self.key_patch.stop)

    def test_gemini_request_and_normalized_response(self):
        def handle(request):
            self.assertEqual(request.headers["x-goog-api-key"], "test-key-only")
            self.assertNotIn("key=", str(request.url))
            payload = json.loads(request.content)
            entry = payload["requests"][0]
            self.assertEqual(entry["taskType"], "RETRIEVAL_DOCUMENT")
            self.assertEqual(entry["outputDimensionality"], 768)
            self.assertEqual(entry["content"]["parts"][0]["text"], "Nội dung")
            return httpx.Response(200, json={"embeddings": [{"values": [2.0] * 768}],
                                             "usageMetadata": {"totalTokenCount": 8}})
        with httpx.Client(transport=httpx.MockTransport(handle)) as client:
            vectors, tokens = embed_batch(client, ["Nội dung"], "Tài liệu")
        self.assertEqual(tokens, 8)
        self.assertAlmostEqual(math.sqrt(sum(x*x for x in vectors[0])), 1.0)

    def test_cohere_request_and_normalized_response(self):
        def handle(request):
            self.assertEqual(str(request.url), "https://api.cohere.com/v2/embed")
            self.assertEqual(request.headers["Authorization"], "Bearer test-cohere-key")
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "embed-v5.0-fast")
            self.assertEqual(payload["input_type"], "search_document")
            self.assertEqual(payload["output_dimension"], 768)
            self.assertEqual(payload["inputs"], [{"content": [{"type": "text", "text": "Nội dung"}]}])
            return httpx.Response(200, json={"embeddings": {"float": [[2.0] * 768]},
                                             "meta": {"billed_units": {"input_tokens": 8}}})
        with patch.object(get_settings(), "embedding_provider", "cohere"), \
                patch.object(get_settings(), "cohere_api_key", SecretStr("test-cohere-key")), \
                httpx.Client(transport=httpx.MockTransport(handle)) as client:
            vectors, tokens = embed_batch(client, ["Nội dung"], "Tài liệu")
        self.assertEqual(tokens, 8)
        self.assertAlmostEqual(sum(x*x for x in vectors[0]), 1.0)

    def test_cohere_errors_and_invalid_vectors(self):
        cases = [(429, {"message": "private test-cohere-key"}, "cohere_http_429"),
                 (200, {"embeddings": {"float": []}}, "cohere_invalid_response"),
                 (200, {"embeddings": {"float": [[0] * 768]}}, "cohere_invalid_response"),
                 (200, {"embeddings": {"float": [[1, 2]]}}, "cohere_invalid_response")]
        with patch.object(get_settings(), "embedding_provider", "cohere"), \
                patch.object(get_settings(), "cohere_api_key", SecretStr("test-cohere-key")):
            for status, payload, code in cases:
                with self.subTest(code=code, payload=payload), httpx.Client(transport=httpx.MockTransport(
                        lambda request: httpx.Response(status, json=payload))) as client:
                    with self.assertRaises(EmbeddingError) as raised:
                        embed_batch(client, ["text"], "Title")
                    self.assertEqual(raised.exception.code, code)
                    self.assertNotIn("private", str(raised.exception))
                    self.assertNotIn("test-cohere-key", str(raised.exception))
            with patch.object(get_settings(), "cohere_api_key", SecretStr("")), httpx.Client() as client:
                with self.assertRaises(EmbeddingError) as raised:
                    embed_batch(client, ["text"], "Title")
                self.assertEqual(raised.exception.code, "cohere_not_configured")

    def test_upstream_errors_do_not_expose_key_or_response(self):
        for status in (400, 403, 429, 500):
            with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(
                    status, json={"error": {"message": "private content test-key-only"}}))) as client:
                with self.assertRaises(EmbeddingError) as raised:
                    embed_batch(client, ["text"], "Title")
            self.assertEqual(raised.exception.code, f"gemini_http_{status}")
            self.assertNotIn("private content", str(raised.exception))
            self.assertNotIn("test-key-only", str(raised.exception))

    def test_invalid_vectors_and_response_counts_are_rejected(self):
        for payload in ({"embeddings": []}, {"embeddings": [{"values": [0] * 768}]},
                        {"embeddings": [{"values": [1, 2]}]}, {"embeddings": [{"values": ["x"] * 768}]},
                        {"embeddings": [{"values": [True] * 768}]}, []):
            with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))) as client:
                with self.assertRaises(EmbeddingError) as raised:
                    embed_batch(client, ["text"], "Title")
            self.assertEqual(raised.exception.code, "gemini_invalid_response")

    def test_timeout_is_safe_and_not_retried_silently(self):
        calls = []
        def handle(request):
            calls.append(request)
            raise httpx.ReadTimeout("private upstream detail", request=request)
        with httpx.Client(transport=httpx.MockTransport(handle)) as client:
            with self.assertRaises(EmbeddingError) as raised:
                embed_batch(client, ["text"], "Title")
        self.assertEqual(raised.exception.code, "gemini_connection")
        self.assertEqual(len(calls), 1)

    def test_chunking_preserves_page_numbers_and_overlap(self):
        settings = get_settings()
        with patch.object(settings, "document_chunk_size", 15), patch.object(settings, "document_chunk_overlap", 3):
            chunks, pages = extract_chunks(test_documents.pdf_bytes(pages=2))
        self.assertEqual(pages, 2)
        self.assertEqual([c["position"] for c in chunks], list(range(len(chunks))))
        self.assertEqual({c["page_number"] for c in chunks}, {1, 2})
        first_page = [c["content"] for c in chunks if c["page_number"] == 1]
        self.assertGreater(len(first_page), 1)
        self.assertEqual(first_page[0][-3:], first_page[1][:3])


class ProcessingTests(test_documents.DocumentTests):
    def setUp(self):
        super().setUp()
        provider_patch = patch.object(self.settings, "embedding_provider", "gemini")
        provider_patch.start()
        self.addCleanup(provider_patch.stop)
        key_patch = patch.object(self.settings, "gemini_api_key", SecretStr("test-only-not-a-real-key"))
        key_patch.start()
        self.addCleanup(key_patch.stop)

    def embed(self, client, texts, title):
        return [[1.0] + [0.0] * 767 for _ in texts], len(texts) * 8

    def run_worker(self):
        with patch("app.services.document_processing.embed_batch", side_effect=self.embed):
            return process_once(self.engine)

    def test_scan_pipeline_ready_with_original_page_sources(self):
        document = self.upload(self.course(), content=scanned_pdf(), filename="scan.pdf").json()
        with patch("app.services.document_processing.open_ocr_engine", return_value=MagicMock()), \
                patch("app.services.document_processing.ocr_page", return_value="StudyFlow nhận dạng tài liệu scan."):
            self.assertTrue(self.run_worker())
        url = f"/api/v1/documents/{document['id']}"
        status = self.client().get(url + "/processing").json()
        self.assertEqual((status["status"], status["chunk_count"]), ("ready", 1))
        chunks = self.client().get(url + "/chunks").json()
        self.assertEqual(chunks[0]["page_number"], 1)
        self.assertEqual(chunks[0]["content"], "StudyFlow nhận dạng tài liệu scan.")

    def test_ocr_failure_has_no_partial_chunks_and_can_be_retried(self):
        document = self.upload(self.course(), content=scanned_pdf()).json()
        url = f"/api/v1/documents/{document['id']}"
        with patch("app.services.document_processing.open_ocr_engine", side_effect=EmbeddingError("ocr_not_configured", "Thiếu dữ liệu OCR.")), \
                patch("app.services.document_processing.embed_batch") as embed:
            self.assertTrue(process_once(self.engine))
        embed.assert_not_called()
        failed = self.client().get(url + "/processing").json()
        self.assertEqual((failed["status"], failed["error_code"], failed["chunk_count"]), ("failed", "ocr_not_configured", 0))
        self.assertEqual(self.client("other").post(url + "/processing/retry").status_code, 403)
        self.assertEqual(self.client().post(url + "/processing/retry").status_code, 202)
        with patch("app.services.document_processing.open_ocr_engine", return_value=MagicMock()), \
                patch("app.services.document_processing.ocr_page", return_value="Đã nhận dạng thành công."):
            self.assertTrue(self.run_worker())
        self.assertEqual(self.client().get(url + "/processing").json()["status"], "ready")

    def test_pipeline_ready_chunks_usage_and_no_duplicate_processing(self):
        document = self.upload(self.course(), content=test_documents.pdf_bytes(pages=2)).json()
        url = f"/api/v1/documents/{document['id']}"
        queued = self.client().get(url + "/processing").json()
        self.assertEqual((queued["status"], queued["attempt_count"], queued["chunk_count"]), ("queued", 0, 0))
        self.assertEqual(self.client().get(url + "/chunks").status_code, 409)
        self.assertTrue(self.run_worker())
        ready = self.client().get(url + "/processing").json()
        self.assertEqual((ready["status"], ready["attempt_count"], ready["chunk_count"]), ("ready", 1, 2))
        chunks = self.client().get(url + "/chunks").json()
        self.assertEqual([c["page_number"] for c in chunks], [1, 2])
        self.assertNotIn("embedding", chunks[0])
        self.assertEqual(len(self.client().get(url + "/chunks?limit=1&offset=1").json()), 1)
        self.assertEqual(self.client().post(url + "/processing/retry").status_code, 409)
        self.assertFalse(self.run_worker())
        with Session(self.engine) as db:
            rows = db.scalars(select(DocumentChunk)).all()
            self.assertEqual(len(rows), 2)
            self.assertEqual(len(rows[0].embedding), 768)
            self.assertEqual(rows[0].embedding_model, self.settings.embedding_model)
            log = db.scalar(select(AIUsageLog))
            self.assertEqual((log.provider, log.status, log.total_tokens), ("gemini", "success", 16))

    def test_failure_retry_permissions_and_atomic_replacement(self):
        document = self.upload(self.course()).json()
        url = f"/api/v1/documents/{document['id']}"
        with patch("app.services.document_processing.embed_batch",
                   side_effect=EmbeddingError("gemini_http_429", "Gemini vượt hạn mức.")):
            self.assertTrue(process_once(self.engine))
        status = self.client().get(url + "/processing").json()
        self.assertEqual((status["status"], status["error_code"], status["chunk_count"]), ("failed", "gemini_http_429", 0))
        self.assertEqual(self.client("other").get(url + "/processing").status_code, 404)
        self.assertEqual(self.client("other").get(url + "/chunks").status_code, 404)
        self.assertEqual(self.client("other").post(url + "/processing/retry").status_code, 403)
        self.assertEqual(self.client("admin").post(url + "/processing/retry").status_code, 403)
        self.assertEqual(self.client().post(url + "/processing/retry", headers={"Origin": "https://other.invalid"}).status_code, 403)
        self.assertEqual(self.client().post(url + "/processing/retry").status_code, 202)
        self.assertEqual(self.client().post(url + "/processing/retry").status_code, 409)
        self.run_worker()
        with Session(self.engine) as db:
            self.assertEqual(db.get(DocumentProcessingJob, document["id"]).attempt_count, 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(DocumentChunk)), 1)
            self.assertEqual(db.scalar(select(func.count()).select_from(AIUsageLog)), 2)

    def test_expired_claim_recovered_and_old_worker_cannot_publish(self):
        document = self.upload(self.course()).json()
        claim = claim_job(self.engine)
        self.assertIsNotNone(claim)
        document_id, old_token = claim
        self.assertIsNone(claim_job(self.engine))
        with Session(self.engine) as db, db.begin():
            job = db.get(DocumentProcessingJob, document_id)
            job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.assertTrue(self.run_worker())
        finish_job(self.engine, document_id, old_token, error=EmbeddingError("old", "Old worker"))
        with self.assertRaises(EmbeddingError) as raised:
            renew_claim(self.engine, document_id, old_token)
        self.assertEqual(raised.exception.code, "claim_lost")
        with Session(self.engine) as db:
            self.assertEqual(db.get(Document, document["id"]).status, "ready")
            self.assertEqual(db.get(DocumentProcessingJob, document["id"]).attempt_count, 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(DocumentChunk)), 1)

    def test_locked_job_is_skipped_by_other_worker(self):
        document = self.upload(self.course()).json()
        with Session(self.engine) as db, db.begin():
            db.scalar(select(DocumentProcessingJob).where(
                DocumentProcessingJob.document_id == UUID(document["id"]),
            ).with_for_update())
            self.assertIsNone(claim_job(self.engine))
        self.assertTrue(self.run_worker())

    def test_chunk_limit_checked_before_any_gemini_request(self):
        document = self.upload(self.course(), content=test_documents.pdf_bytes(pages=2)).json()
        with patch.object(self.settings, "document_max_chunks", 1), \
                patch("app.services.document_processing.embed_batch") as embed:
            process_once(self.engine)
            embed.assert_not_called()
        with Session(self.engine) as db:
            self.assertEqual(db.get(Document, document["id"]).status, "failed")
            self.assertEqual(db.get(DocumentProcessingJob, document["id"]).error_code, "chunk_limit")
            self.assertEqual(db.scalar(select(func.count()).select_from(AIUsageLog)), 0)

    def test_later_batch_failure_keeps_all_chunks_unpublished(self):
        document = self.upload(self.course(), content=test_documents.pdf_bytes(pages=2)).json()
        calls = 0
        def second_batch_fails(client, texts, title):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise EmbeddingError("gemini_http_429", "Gemini vượt hạn mức.")
            return self.embed(client, texts, title)
        with patch.object(self.settings, "embedding_batch_size", 1), \
                patch("app.services.document_processing.embed_batch", side_effect=second_batch_fails):
            process_once(self.engine)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Document, document["id"]).status, "failed")
            self.assertEqual(db.scalar(select(func.count()).select_from(DocumentChunk)), 0)
            self.assertEqual(db.scalar(select(func.count()).select_from(AIUsageLog)), 2)

    def test_missing_key_preserves_queue_and_storage_failure_is_retryable(self):
        document = self.upload(self.course()).json()
        with patch.object(self.settings, "gemini_api_key", SecretStr("")):
            with self.assertRaises(EmbeddingError):
                process_once(self.engine)
        with Session(self.engine) as db:
            self.assertEqual(db.get(Document, document["id"]).status, "queued")
        with patch("app.services.document_processing.read_file_bytes", side_effect=HTTPException(503, "private")):
            process_once(self.engine)
        with Session(self.engine) as db:
            self.assertEqual(db.get(DocumentProcessingJob, document["id"]).error_code, "storage_error")

    def test_missing_local_pdf_reports_actionable_error_without_gemini_call(self):
        document = self.upload(self.course()).json()
        with Session(self.engine) as db:
            key = db.get(Document, document["id"]).storage_key
        (self.storage / key).unlink()
        with patch("app.services.document_processing.embed_batch") as embed:
            with self.assertLogs("app.services.document_processing", level="WARNING") as logs:
                process_once(self.engine)
            embed.assert_not_called()
        self.assertIn("storage_file_missing", logs.output[0])
        with Session(self.engine) as db:
            self.assertEqual(db.get(Document, document["id"]).status, "failed")
            job = db.get(DocumentProcessingJob, document["id"])
            self.assertEqual(job.error_code, "storage_file_missing")
            self.assertIn("PDF", job.error_message)

    def test_deleting_source_during_gemini_call_does_not_publish_chunks(self):
        document = self.upload(self.course()).json()
        def delete_during_request(client, texts, title):
            self.client().delete(f"/api/v1/documents/{document['id']}")
            return self.embed(client, texts, title)
        with patch("app.services.document_processing.embed_batch", side_effect=delete_during_request):
            process_once(self.engine)
        with Session(self.engine) as db:
            self.assertEqual(db.get(DocumentProcessingJob, document["id"]).error_code, "source_unavailable")
            self.assertEqual(db.scalar(select(func.count()).select_from(DocumentChunk)), 0)

    def test_unpublished_class_chunks_are_not_retrievable_and_cleanup_removes_vectors(self):
        course, classroom = self.classroom()
        self.join(classroom)
        document = self.upload(course, name="teacher", classroom_id=classroom).json()
        url = f"/api/v1/documents/{document['id']}"
        self.run_worker()
        self.assertEqual(self.client().get(url + "/chunks").status_code, 404)
        self.client("teacher").patch(url, json={"published": True})
        self.assertEqual(self.client().get(url + "/chunks").status_code, 200)
        self.client("teacher").patch(url, json={"published": False})
        self.assertEqual(self.client().get(url + "/chunks").status_code, 404)
        self.client("teacher").delete(url)
        with patch.object(self.settings, "document_retention_days", 0):
            with Session(self.engine) as db, db.begin():
                self.assertEqual(cleanup_documents(db, apply=True), (1, 0))
                self.assertEqual(db.scalar(select(func.count()).select_from(DocumentChunk)), 0)


def load_tests(loader, tests, pattern):
    # Reuse the existing database fixture without running inherited M04 tests twice.
    return unittest.TestSuite([
        loader.loadTestsFromTestCase(OCRTests),
        loader.loadTestsFromTestCase(EmbeddingTests),
        unittest.TestSuite(ProcessingTests(name) for name in loader.getTestCaseNames(ProcessingTests)
                           if name in ProcessingTests.__dict__),
    ])


if __name__ == "__main__":
    unittest.main()
