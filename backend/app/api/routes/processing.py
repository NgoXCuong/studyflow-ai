from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import CurrentUser, Database, require_same_origin
from app.models.processing import DocumentChunk
from app.schemas.processing import ChunkOutput, ProcessingOutput
from app.services.document_processing import processing_output, ready_chunks, retry_processing
from app.services.documents import get_document

router = APIRouter(tags=["document-processing"])


@router.get("/documents/{document_id}/processing", response_model=ProcessingOutput)
def read_processing(document_id: UUID, user: CurrentUser, db: Database):
    return processing_output(db, get_document(db, user, document_id))


@router.post("/documents/{document_id}/processing/retry", response_model=ProcessingOutput,
             status_code=202, dependencies=[Depends(require_same_origin)])
def retry_document(document_id: UUID, user: CurrentUser, db: Database):
    return retry_processing(db, user, document_id)


@router.get("/documents/{document_id}/chunks", response_model=list[ChunkOutput])
def list_chunks(document_id: UUID, user: CurrentUser, db: Database,
                limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0)):
    document = get_document(db, user, document_id)
    if document.status != "ready":
        raise HTTPException(409, "Tài liệu chưa sẵn sàng để truy xuất nội dung.")
    return db.scalars(ready_chunks(user).where(DocumentChunk.document_id == document_id)
                      .order_by(DocumentChunk.position).limit(limit).offset(offset)).all()
