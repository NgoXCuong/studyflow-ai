from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Quiz(Base):
    __tablename__ = "quizzes"
    __table_args__ = (CheckConstraint("status IN ('draft','published')", name="quizzes_status_check"),
                      CheckConstraint("(status = 'draft' AND published_at IS NULL AND reviewed_by IS NULL AND classroom_id IS NULL) OR "
                                      "(status = 'published' AND published_at IS NOT NULL AND "
                                      "(classroom_id IS NULL OR reviewed_by = owner_id))", name="quizzes_publication_check"),
                      CheckConstraint("classroom_id IS NULL OR reviewed_by IS NOT NULL", name="quizzes_review_check"),
                      CheckConstraint("difficulty IN ('easy','medium','hard')"),
                      Index("quizzes_owner_document_idx", "owner_id", "document_id"),
                      Index("quizzes_classroom_idx", "classroom_id", "status"))
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id"))
    title: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default=text("'draft'"))
    generation_model: Mapped[str] = mapped_column(Text)
    classroom_id: Mapped[UUID | None] = mapped_column(ForeignKey("classrooms.id"))
    reviewed_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    copied_from_id: Mapped[UUID | None] = mapped_column(ForeignKey("quizzes.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (UniqueConstraint("quiz_id", "position"), UniqueConstraint("id", "quiz_id", name="quiz_questions_id_quiz_key"), CheckConstraint("position >= 0"),
                      CheckConstraint("correct_index BETWEEN 0 AND 3"), CheckConstraint("jsonb_array_length(choices) = 4"))
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    quiz_id: Mapped[UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    choices: Mapped[list] = mapped_column(JSONB)
    correct_index: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSONB)
