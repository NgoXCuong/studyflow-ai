from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''"),
        CheckConstraint("btrim(original_filename) <> ''"),
        CheckConstraint("btrim(storage_key) <> ''"),
        CheckConstraint("mime_type = 'application/pdf'"),
        CheckConstraint("size_bytes > 0"),
        CheckConstraint("page_count > 0"),
        CheckConstraint("status IN ('queued','processing','ready','failed')"),
        CheckConstraint("published_at IS NULL OR classroom_id IS NOT NULL"),
        CheckConstraint("status <> 'ready' OR page_count IS NOT NULL"),
        UniqueConstraint("id", "course_id"),
        ForeignKeyConstraint(["classroom_id", "course_id"], ["classrooms.id", "classrooms.course_id"]),
        ForeignKeyConstraint(["chapter_id", "course_id"], ["chapters.id", "chapters.course_id"]),
        Index("documents_owner_idx", "owner_id", "course_id", postgresql_where=text("deleted_at IS NULL")),
        Index("documents_course_idx", "course_id", postgresql_where=text("deleted_at IS NULL")),
        Index("documents_classroom_idx", "classroom_id", postgresql_where=text("deleted_at IS NULL")),
        Index("documents_chapter_idx", "chapter_id"),
        Index("documents_storage_owner_idx", "owner_id", postgresql_where=text("storage_deleted_at IS NULL")),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    classroom_id: Mapped[UUID | None] = mapped_column(Uuid)
    chapter_id: Mapped[UUID | None] = mapped_column(Uuid)
    title: Mapped[str] = mapped_column(Text)
    original_filename: Mapped[str] = mapped_column(Text)
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    mime_type: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    page_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, server_default=text("'queued'"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    storage_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
