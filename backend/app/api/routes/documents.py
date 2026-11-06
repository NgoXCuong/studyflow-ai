from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import StringConstraints
from sqlalchemy import func, or_

from app.api.dependencies import CurrentUser, Database, require_same_origin
from app.schemas.auth import MessageOutput
from app.schemas.courses import Title
from app.schemas.documents import DocumentOutput, DocumentUpdate
from app.services import documents, document_storage
from app.services.courses import get_chapter, get_classroom, get_course
from app.models.documents import Document

router = APIRouter(tags=["documents"])
mutation = [Depends(require_same_origin)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
Search = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


@router.post("/courses/{course_id}/documents", response_model=DocumentOutput, status_code=201, dependencies=mutation)
def upload_document(course_id: UUID, file: Annotated[UploadFile, File()], title: Annotated[Title, Form()],
                    user: CurrentUser, db: Database, classroom_id: Annotated[UUID | None, Form()] = None,
                    chapter_id: Annotated[UUID | None, Form()] = None):
    return documents.upload_document(db, user, course_id, file, title, classroom_id, chapter_id)


@router.get("/courses/{course_id}/documents", response_model=list[DocumentOutput])
def list_documents(course_id: UUID, user: CurrentUser, db: Database,
                   classroom_id: UUID | None = None, chapter_id: UUID | None = None,
                   q: Annotated[Search | None, Query()] = None,
                   limit: Limit = 50, offset: Offset = 0):
    get_course(db, user, course_id)
    query = documents.visible_documents(user).where(Document.course_id == course_id)
    if classroom_id is not None:
        classroom = get_classroom(db, user, classroom_id)
        if classroom.course_id != course_id:
            raise HTTPException(404, "Không tìm thấy lớp học trong môn này.")
        query = query.where(Document.classroom_id == classroom_id)
    if chapter_id is not None:
        get_chapter(db, course_id, chapter_id)
        query = query.where(Document.chapter_id == chapter_id)
    if q is not None:
        query = query.where(or_(Document.title.icontains(q, autoescape=True),
                                Document.original_filename.icontains(q, autoescape=True)))
    return db.scalars(query.order_by(Document.created_at.desc(), Document.id).limit(limit).offset(offset)).all()


@router.get("/documents/{document_id}", response_model=DocumentOutput)
def read_document(document_id: UUID, user: CurrentUser, db: Database):
    return documents.get_document(db, user, document_id)


@router.get("/documents/{document_id}/file", response_class=FileResponse)
def read_file(document_id: UUID, request: Request, user: CurrentUser, db: Database):
    document = documents.get_document(db, user, document_id)
    return document_storage.file_response(document, request.headers.get("range"))


@router.patch("/documents/{document_id}", response_model=DocumentOutput, dependencies=mutation)
def update_document(document_id: UUID, data: DocumentUpdate, user: CurrentUser, db: Database):
    document = documents.get_document(db, user, document_id, write=True)
    if "chapter_id" in data.model_fields_set:
        if data.chapter_id is not None:
            get_chapter(db, document.course_id, data.chapter_id)
        document.chapter_id = data.chapter_id
    if "title" in data.model_fields_set:
        document.title = data.title
    if "published" in data.model_fields_set:
        documents.set_publication(document, data.published)
    db.flush()
    return document


@router.delete("/documents/{document_id}", response_model=MessageOutput, dependencies=mutation)
def delete_document(document_id: UUID, user: CurrentUser, db: Database):
    document = documents.get_document(db, user, document_id, write=True)
    document.deleted_at = func.now()
    document.published_at = None
    return {"message": "Đã xóa tài liệu."}
