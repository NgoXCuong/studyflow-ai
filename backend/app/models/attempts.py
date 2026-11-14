from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        UniqueConstraint("id", "quiz_id"),
        UniqueConstraint("id", "quiz_id", "user_id"),
        ForeignKeyConstraint(["source_attempt_id", "quiz_id", "user_id"],
                             ["quiz_attempts.id", "quiz_attempts.quiz_id", "quiz_attempts.user_id"]),
        CheckConstraint("scope IN ('full','wrong_only')"),
        CheckConstraint("purpose IN ('practice','diagnostic')"),
        CheckConstraint("status IN ('in_progress','submitted')"),
        CheckConstraint("scope <> 'wrong_only' OR source_attempt_id IS NOT NULL"),
        CheckConstraint("source_attempt_id IS NULL OR source_attempt_id <> id"),
        CheckConstraint("(status = 'submitted') = (submitted_at IS NOT NULL)"),
        CheckConstraint("submitted_at IS NULL OR submitted_at >= started_at"),
        Index("quiz_attempts_user_idx", "user_id", "started_at"),
        Index("quiz_attempts_quiz_idx", "quiz_id", "status"),
        Index("quiz_attempts_active_idx", "quiz_id", "user_id", unique=True,
              postgresql_where=text("status = 'in_progress'")),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    quiz_id: Mapped[UUID] = mapped_column(ForeignKey("quizzes.id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    source_attempt_id: Mapped[UUID | None]
    scope: Mapped[str] = mapped_column(Text, server_default=text("'full'"))
    purpose: Mapped[str] = mapped_column(Text, server_default=text("'practice'"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'in_progress'"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"
    __table_args__ = (
        ForeignKeyConstraint(["attempt_id", "quiz_id"], ["quiz_attempts.id", "quiz_attempts.quiz_id"]),
        ForeignKeyConstraint(["question_id", "quiz_id"], ["quiz_questions.id", "quiz_questions.quiz_id"]),
        CheckConstraint("selected_index IS NULL OR selected_index BETWEEN 0 AND 3"),
    )
    attempt_id: Mapped[UUID] = mapped_column(primary_key=True)
    question_id: Mapped[UUID] = mapped_column(primary_key=True)
    quiz_id: Mapped[UUID]
    selected_index: Mapped[int | None] = mapped_column(Integer)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
