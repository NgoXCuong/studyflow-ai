from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StudyMaterial(Base):
    __tablename__ = "study_materials"
    __table_args__ = (
        CheckConstraint("kind IN ('flashcards','mindmap')"),
        CheckConstraint("btrim(title) <> ''"),
        Index("study_materials_owner_document_idx", "owner_id", "document_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"))
    kind: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[dict] = mapped_column(JSONB)
    generation_model: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
