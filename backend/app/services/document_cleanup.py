"""Preview or purge expired, soft-deleted document files."""

import argparse
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.connection import get_engine
from app.models import auth  # noqa: F401
from app.models.courses import Classroom, Course
from app.models.documents import Document
from app.models.processing import DocumentChunk
from app.services.document_storage import delete_file

logger = logging.getLogger(__name__)


def cleanup_documents(db: Session, *, apply: bool = False, limit: int = 100) -> tuple[int, int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=get_settings().document_retention_days)
    query = select(Document).join(Course).outerjoin(Classroom, Classroom.id == Document.classroom_id).where(
        Document.storage_deleted_at.is_(None),
        or_(Document.deleted_at <= cutoff, Course.deleted_at <= cutoff, Classroom.deleted_at <= cutoff),
    ).order_by(Document.id).limit(limit)
    if apply:
        query = query.with_for_update(of=Document, skip_locked=True)
    count = failures = 0
    for document in db.scalars(query):
        if apply:
            try:
                delete_file(document.storage_key)
            except (HTTPException, OSError):
                failures += 1
                logger.exception("Unable to purge document %s", document.id)
                continue
            document.storage_deleted_at = datetime.now(timezone.utc)
            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        count += 1
    return count, failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Delete expired files; default only previews the count.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum number of files per run.")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")
    with Session(get_engine()) as db, db.begin():
        count, failures = cleanup_documents(db, apply=args.apply, limit=args.limit)
    print(f"{'Deleted' if args.apply else 'Eligible'}: {count}; failed: {failures}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
