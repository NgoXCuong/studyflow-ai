from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.api.dependencies import CurrentUser, Database, require_roles, require_same_origin
from app.models.study_materials import StudyMaterial
from app.schemas.study_materials import GenerateInput, MaterialInput, MaterialOutput, MaterialSummary, ReviewInput, SelectionInput
from app.services import study_materials as service
from app.services.documents import get_document

router = APIRouter(tags=["study-materials"], dependencies=[Depends(require_roles("student", "teacher"))])
mutation = [Depends(require_same_origin)]


@router.get("/documents/{document_id}/study-materials", response_model=list[MaterialSummary])
def list_materials(document_id: UUID, user: CurrentUser, db: Database,
                   kind: Literal["flashcards", "mindmap"], limit: int = Query(20, ge=1, le=100),
                   offset: int = Query(0, ge=0)):
    get_document(db, user, document_id)
    return db.scalars(select(StudyMaterial).where(StudyMaterial.document_id == document_id,
        StudyMaterial.owner_id == user.id, StudyMaterial.kind == kind)
        .order_by(StudyMaterial.created_at.desc(), StudyMaterial.id).limit(limit).offset(offset)).all()


@router.post("/documents/{document_id}/study-materials", response_model=MaterialOutput, status_code=201, dependencies=mutation)
def create(document_id: UUID, data: MaterialInput, user: CurrentUser, db: Database):
    return service.output(db, user, service.create_material(db, user, document_id, data))


@router.post("/documents/{document_id}/study-materials/generate", response_model=MaterialOutput, status_code=201, dependencies=mutation)
def generate(document_id: UUID, data: GenerateInput, user: CurrentUser, db: Database):
    return service.output(db, user, service.generate_material(db, user, document_id, data))


@router.get("/study-materials/{material_id}", response_model=MaterialOutput)
def read(material_id: UUID, user: CurrentUser, db: Database):
    return service.output(db, user, service.get_material(db, user, material_id))


@router.post("/documents/{document_id}/study-materials/from-selection", response_model=MaterialOutput,
             status_code=201, dependencies=mutation)
def from_selection(document_id: UUID, data: SelectionInput, user: CurrentUser, db: Database):
    return service.output(db, user, service.from_selection(db, user, document_id, data))


@router.put("/study-materials/{material_id}", response_model=MaterialOutput, dependencies=mutation)
def update(material_id: UUID, data: MaterialInput, user: CurrentUser, db: Database):
    material = service.get_material(db, user, material_id, lock=True)
    if material.kind != data.kind:
        raise HTTPException(422, "Không thể đổi loại học liệu.")
    service.check_sources(db, material.document_id, data.content)
    material.title = data.title
    material.content = service.saved_content(data.content, material.content)
    db.flush()
    return service.output(db, user, material)


@router.patch("/study-materials/{material_id}/cards/{position}", response_model=MaterialOutput, dependencies=mutation)
def review(material_id: UUID, position: int, data: ReviewInput, user: CurrentUser, db: Database):
    return service.output(db, user, service.review_card(db, user, material_id, position, data.known))


@router.delete("/study-materials/{material_id}", dependencies=mutation)
def delete(material_id: UUID, user: CurrentUser, db: Database):
    db.delete(service.get_material(db, user, material_id, lock=True))
    db.flush()
    return {"message": "Đã xóa học liệu."}
