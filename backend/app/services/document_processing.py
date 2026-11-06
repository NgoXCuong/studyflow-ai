"""Run the durable PDF-to-vector embedding worker."""

import argparse
import logging
import re
import time
from datetime import timedelta
from io import BytesIO
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
from pypdf import PdfReader
from pypdf.errors import PyPdfError
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.connection import get_engine
from app.models.auth import User
from app.models.courses import Classroom, Course
from app.models.documents import Document
from app.models.processing import AIUsageLog, DocumentChunk, DocumentProcessingJob
from app.services.document_storage import read_file_bytes
from app.services.documents import get_document, visible_documents
from app.services.embeddings import EmbeddingError, embed_batch, require_embedding_key

logger = logging.getLogger(__name__)


def source_documents():
    return select(Document).join(Course, Course.id == Document.course_id).outerjoin(
        Classroom, Classroom.id == Document.classroom_id,
    ).join(User, User.id == Document.owner_id).where(
        Document.deleted_at.is_(None), Document.storage_deleted_at.is_(None), Course.deleted_at.is_(None),
        or_(Document.classroom_id.is_(None), Classroom.deleted_at.is_(None)), User.status == "active",
        or_(and_(Course.kind == "personal", User.role == "student"),
            and_(Course.kind == "teaching", User.role == "teacher")),
    )


def ready_chunks(user: User):
    allowed = visible_documents(user).where(Document.status == "ready").with_only_columns(Document.id)
    return select(DocumentChunk).where(DocumentChunk.document_id.in_(allowed))


def processing_output(db: Session, document: Document) -> dict:
    job = db.get(DocumentProcessingJob, document.id)
    count = db.scalar(select(func.count()).select_from(DocumentChunk).where(
        DocumentChunk.document_id == document.id,
    )) if document.status == "ready" else 0
    return {
        "document_id": document.id, "status": document.status, "chunk_count": count,
        "attempt_count": job.attempt_count if job else 0,
        "started_at": job.started_at if job else None, "finished_at": job.finished_at if job else None,
        "error_code": job.error_code if job else None, "error_message": job.error_message if job else None,
    }


def retry_processing(db: Session, user: User, document_id: UUID) -> dict:
    document = get_document(db, user, document_id, write=True)
    if document.status != "failed":
        raise HTTPException(409, "Chỉ có thể xử lý lại tài liệu đang ở trạng thái failed.")
    job = db.scalar(select(DocumentProcessingJob).where(
        DocumentProcessingJob.document_id == document_id,
    ).with_for_update())
    if job is None:
        job = DocumentProcessingJob(document_id=document_id)
        db.add(job)
    job.claim_token = job.lease_expires_at = job.started_at = job.finished_at = None
    job.error_code = job.error_message = None
    document.status = "queued"
    db.flush()
    return processing_output(db, document)


def extract_chunks(content: bytes) -> tuple[list[dict], int]:
    settings = get_settings()
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted or not 0 < len(reader.pages) <= settings.document_max_pages:
            raise EmbeddingError("invalid_pdf", "PDF được bảo vệ hoặc vượt giới hạn số trang xử lý.")
        chunks = []
        for page_number, page in enumerate(reader.pages, 1):
            text = re.sub(r"\s+", " ", (page.extract_text() or "").replace("\x00", "")).strip()
            start = 0
            while start < len(text):
                end = min(start + settings.document_chunk_size, len(text))
                if end < len(text):
                    boundary = text.rfind(" ", start + settings.document_chunk_size // 2, end)
                    if boundary > start + settings.document_chunk_overlap:
                        end = boundary
                value = text[start:end].strip()
                if value:
                    chunks.append({"position": len(chunks), "page_number": page_number, "content": value})
                    if len(chunks) > settings.document_max_chunks:
                        raise EmbeddingError("chunk_limit", "Tài liệu vượt giới hạn số đoạn xử lý cho phép.")
                if end == len(text):
                    break
                start = end - settings.document_chunk_overlap
        if not chunks:
            raise EmbeddingError("empty_pdf", "PDF không có văn bản để tạo embedding.")
        return chunks, len(reader.pages)
    except (PyPdfError, ValueError, TypeError, KeyError, IndexError, RecursionError) as exc:
        raise EmbeddingError("invalid_pdf", "Không trích xuất được văn bản từ PDF.") from exc


def claim_job(engine) -> tuple[UUID, UUID] | None:
    with Session(engine) as db, db.begin():
        job = db.scalar(select(DocumentProcessingJob).join(Document).where(
            Document.storage_deleted_at.is_(None), Document.deleted_at.is_(None),
            or_(Document.status == "queued", and_(Document.status == "processing", or_(
                DocumentProcessingJob.lease_expires_at.is_(None),
                DocumentProcessingJob.lease_expires_at <= func.now(),
            ))),
            Document.id.in_(source_documents().with_only_columns(Document.id)),
        ).order_by(DocumentProcessingJob.created_at, DocumentProcessingJob.document_id)
            .with_for_update(of=DocumentProcessingJob, skip_locked=True).limit(1))
        if job is None:
            return None
        document = db.scalar(select(Document).where(Document.id == job.document_id).with_for_update())
        token = uuid4()
        now = db.scalar(select(func.now()))
        job.claim_token, job.started_at = token, now
        job.lease_expires_at = now + timedelta(seconds=get_settings().processing_lease_seconds)
        job.finished_at = job.error_code = job.error_message = None
        job.attempt_count += 1
        document.status = "processing"
        return document.id, token


def renew_claim(engine, document_id: UUID, token: UUID) -> Document:
    with Session(engine, expire_on_commit=False) as db, db.begin():
        job = db.scalar(select(DocumentProcessingJob).where(
            DocumentProcessingJob.document_id == document_id, DocumentProcessingJob.claim_token == token,
        ).with_for_update())
        if job is None:
            raise EmbeddingError("claim_lost", "Tác vụ đã được worker khác tiếp nhận.")
        document = db.scalar(source_documents().where(Document.id == document_id))
        if document is None:
            raise EmbeddingError("source_unavailable", "Tài liệu hoặc quyền sở hữu không còn khả dụng.")
        job.lease_expires_at = db.scalar(select(func.now())) + timedelta(seconds=get_settings().processing_lease_seconds)
        return document


def finish_job(engine, document_id: UUID, token: UUID, *, chunks=None, page_count=None,
               error: EmbeddingError | None = None) -> None:
    with Session(engine) as db, db.begin():
        job = db.scalar(select(DocumentProcessingJob).where(
            DocumentProcessingJob.document_id == document_id, DocumentProcessingJob.claim_token == token,
        ).with_for_update())
        if job is None:
            return
        document = db.scalar(select(Document).where(Document.id == document_id).with_for_update())
        if error is None and db.scalar(source_documents().where(Document.id == document_id)) is None:
            error = EmbeddingError("source_unavailable", "Tài liệu hoặc quyền sở hữu không còn khả dụng.")
        if error:
            document.status = "failed"
            job.error_code, job.error_message = error.code, str(error)
        else:
            # Replace atomically: retries and recovered workers cannot append duplicate chunks.
            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
            db.add_all([DocumentChunk(document_id=document_id, embedding_model=get_settings().embedding_model,
                                      **chunk) for chunk in chunks])
            document.page_count, document.status = page_count, "ready"
        job.finished_at = db.scalar(select(func.now()))
        job.claim_token = job.lease_expires_at = None
    if error:
        logger.warning("Document %s failed: %s", document_id, error.code)
    else:
        logger.info("Document %s ready: %s chunks saved", document_id, len(chunks))


def process_once(engine=None) -> bool:
    settings = get_settings()
    require_embedding_key()
    engine = engine if engine is not None else get_engine()
    claim = claim_job(engine)
    if claim is None:
        return False
    document_id, token = claim
    logger.info("Processing document %s: reading source PDF", document_id)
    try:
        document = renew_claim(engine, document_id, token)
        chunks, page_count = extract_chunks(read_file_bytes(document.storage_key))
        logger.info("Document %s: extracted %s pages into %s chunks", document_id, page_count, len(chunks))
        with httpx.Client(timeout=settings.embedding_timeout_seconds) as client:
            for start in range(0, len(chunks), settings.embedding_batch_size):
                document = renew_claim(engine, document_id, token)
                batch = chunks[start:start + settings.embedding_batch_size]
                texts = [chunk["content"] for chunk in batch]
                logger.info("Document %s: embedding chunks %s-%s/%s", document_id,
                            start + 1, start + len(batch), len(chunks))
                started = time.monotonic()
                error = None
                tokens = None
                try:
                    vectors, tokens = embed_batch(client, texts, document.title)
                except EmbeddingError as exc:
                    error = exc
                    raise
                finally:
                    with Session(engine) as db, db.begin():
                        db.add(AIUsageLog(
                            document_id=document_id, owner_id=document.owner_id, provider=settings.embedding_provider,
                            model=settings.embedding_model, operation="document_embedding",
                            status="failed" if error else "success", input_characters=sum(map(len, texts)),
                            chunk_count=len(batch), duration_ms=int((time.monotonic() - started) * 1000),
                            total_tokens=tokens, error_code=error.code if error else None,
                        ))
                for chunk, vector in zip(batch, vectors, strict=True):
                    chunk["embedding"] = vector
        finish_job(engine, document_id, token, chunks=chunks, page_count=page_count)
    except EmbeddingError as exc:
        finish_job(engine, document_id, token, error=exc)
    except FileNotFoundError:
        finish_job(engine, document_id, token, error=EmbeddingError(
            "storage_file_missing", "Không tìm thấy PDF gốc. Vui lòng tải lại tài liệu.",
        ))
    except (HTTPException, OSError):
        finish_job(engine, document_id, token, error=EmbeddingError("storage_error", "Không đọc được file PDF từ kho lưu trữ."))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Process at most one document and exit.")
    args = parser.parse_args()
    try:
        require_embedding_key()
    except EmbeddingError as exc:
        parser.exit(2, f"{exc}\n")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger.info("PDF processing worker started%s", " (--once)" if args.once else " (Ctrl+C to stop)")
    waiting = False
    try:
        while True:
            processed = process_once()
            if args.once:
                if not processed:
                    logger.info("No eligible queued documents")
                break
            if not processed:
                if not waiting:
                    logger.info("Waiting for queued documents; checking every 5 seconds")
                waiting = True
                time.sleep(5)
            else:
                waiting = False
    except KeyboardInterrupt:
        logger.info("PDF processing worker stopped")


if __name__ == "__main__":
    main()
