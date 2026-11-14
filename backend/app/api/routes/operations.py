from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, StringConstraints
from sqlalchemy import func, or_, select

from app.api.dependencies import Database, require_roles
from app.models.courses import Classroom, Course
from app.models.documents import Document
from app.models.processing import AIUsageLog, DocumentProcessingJob
from app.schemas.operations import ProcessingOverview, UsageOverview

router = APIRouter(prefix="/admin", tags=["admin-operations"], dependencies=[Depends(require_roles("admin"))])
FilterText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


@router.get("/processing", response_model=ProcessingOverview)
def processing(db: Database, status: Literal["queued", "processing", "ready", "failed"] | None = None,
               document_id: UUID | None = None, owner_id: UUID | None = None, include_removed: bool = False,
               limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    removed = or_(Document.deleted_at.is_not(None), Course.deleted_at.is_not(None), Classroom.deleted_at.is_not(None))
    query = select(Document.id.label("document_id"), Document.owner_id, Document.status,
        removed.label("source_removed"), func.coalesce(DocumentProcessingJob.attempt_count, 0).label("attempt_count"),
        DocumentProcessingJob.started_at, DocumentProcessingJob.finished_at, DocumentProcessingJob.lease_expires_at,
        DocumentProcessingJob.error_code, Document.created_at, Document.updated_at,
    ).join(Course, Course.id == Document.course_id).outerjoin(Classroom, Classroom.id == Document.classroom_id)
    query = query.outerjoin(DocumentProcessingJob, DocumentProcessingJob.document_id == Document.id)
    if not include_removed:
        query = query.where(~removed)
    if status is not None:
        query = query.where(Document.status == status)
    if document_id is not None:
        query = query.where(Document.id == document_id)
    if owner_id is not None:
        query = query.where(Document.owner_id == owner_id)
    filtered = query.subquery()
    counts = {key: 0 for key in ("queued", "processing", "ready", "failed")}
    counts.update(dict(db.execute(select(filtered.c.status, func.count()).group_by(filtered.c.status)).all()))
    rows = db.execute(query.order_by(Document.updated_at.desc(), Document.id).limit(limit).offset(offset))
    return {"total": sum(counts.values()), "counts": counts, "items": [dict(row._mapping) for row in rows]}


@router.get("/ai-usage", response_model=UsageOverview)
def ai_usage(db: Database,
             operation: Literal["document_embedding", "question_embedding", "qa_generation", "quiz_generation", "flashcards_generation", "mindmap_generation"] | None = None,
             status: Literal["success", "failed"] | None = None,
             provider: Annotated[FilterText | None, Query()] = None,
             model: Annotated[FilterText | None, Query()] = None,
             document_id: UUID | None = None, owner_id: UUID | None = None,
             created_from: AwareDatetime | None = None, created_to: AwareDatetime | None = None,
             limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    if created_from and created_to and created_from >= created_to:
        raise HTTPException(422, "Thời gian bắt đầu phải trước thời gian kết thúc.")
    query = select(AIUsageLog)
    for column, value in ((AIUsageLog.operation, operation), (AIUsageLog.status, status),
                          (AIUsageLog.provider, provider), (AIUsageLog.model, model),
                          (AIUsageLog.document_id, document_id), (AIUsageLog.owner_id, owner_id)):
        if value is not None:
            query = query.where(column == value)
    if created_from:
        query = query.where(AIUsageLog.created_at >= created_from)
    if created_to:
        query = query.where(AIUsageLog.created_at < created_to)
    filtered = query.subquery()
    totals = db.execute(select(func.count().label("total"),
        func.count().filter(filtered.c.status == "success").label("success_count"),
        func.count().filter(filtered.c.status == "failed").label("failed_count"),
        func.sum(filtered.c.total_tokens).label("recorded_tokens"),
        func.count(filtered.c.total_tokens).label("token_recorded_count"),
        func.avg(filtered.c.duration_ms).label("average_duration_ms"),
    ).select_from(filtered)).one()
    operations = dict(db.execute(select(filtered.c.operation, func.count()).group_by(filtered.c.operation)).all())
    items = db.scalars(query.order_by(AIUsageLog.created_at.desc(), AIUsageLog.id).limit(limit).offset(offset)).all()
    return dict(totals._mapping) | {"operations": operations, "items": items}
