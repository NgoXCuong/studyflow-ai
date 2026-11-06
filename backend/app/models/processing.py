from datetime import datetime
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DocumentProcessingJob(Base):
    __tablename__ = "document_processing_jobs"
    __table_args__ = (
        CheckConstraint("attempt_count >= 0"),
        Index("document_processing_jobs_lease_idx", "lease_expires_at"),
    )

    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"), primary_key=True)
    attempt_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    claim_token: Mapped[UUID | None] = mapped_column(Uuid)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "position"),
        CheckConstraint("position >= 0"),
        CheckConstraint("page_number > 0"),
        CheckConstraint("btrim(content) <> ''"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"))
    position: Mapped[int] = mapped_column(Integer)
    page_number: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(768))
    embedding_model: Mapped[str] = mapped_column(Text)


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        CheckConstraint("status IN ('success','failed')"),
        CheckConstraint("input_characters >= 0"),
        CheckConstraint("chunk_count > 0"),
        CheckConstraint("duration_ms >= 0"),
        CheckConstraint("total_tokens >= 0"),
        Index("ai_usage_logs_document_idx", "document_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    operation: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    input_characters: Mapped[int] = mapped_column(Integer)
    chunk_count: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
