import logging
import time
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.processing import AIUsageLog
from app.services.embeddings import EmbeddingError

logger = logging.getLogger(__name__)


def reported_tokens(response: dict) -> int | None:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return None
    for field in ("tokens", "billed_units"):
        counts = usage.get(field)
        if isinstance(counts, dict):
            values = [counts.get("input_tokens"), counts.get("output_tokens")]
            if all(type(value) is int and value >= 0 for value in values):
                return sum(values)
    return None


@contextmanager
def track_usage(db, user_id, document_id, provider, model, operation, input_characters, chunk_count):
    started = time.monotonic()
    usage = {"total_tokens": None}
    error_code = "unexpected_error"
    try:
        yield usage
        error_code = None
    except HTTPException as exc:
        error_code = f"api_http_{exc.status_code}"
        raise
    except EmbeddingError as exc:
        error_code = exc.code
        raise
    finally:
        # Independent transaction preserves call metadata when the main request rolls back.
        try:
            with Session(db.get_bind()) as logs, logs.begin():
                logs.add(AIUsageLog(document_id=document_id, owner_id=user_id, provider=provider, model=model,
                    operation=operation, status="failed" if error_code else "success", input_characters=input_characters,
                    chunk_count=chunk_count, duration_ms=int((time.monotonic() - started) * 1000),
                    total_tokens=usage["total_tokens"], error_code=error_code))
        except SQLAlchemyError as exc:
            logger.error("AI usage metadata could not be saved: %s", type(exc).__name__)
