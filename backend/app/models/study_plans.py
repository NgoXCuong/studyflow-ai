from datetime import date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StudyPlan(Base):
    __tablename__ = "study_plans"
    __table_args__ = (
        CheckConstraint("btrim(goal) <> ''"),
        CheckConstraint("read_minutes BETWEEN 1 AND 1440 AND quiz_minutes BETWEEN 1 AND 1440 AND review_minutes BETWEEN 1 AND 1440"),
        Index("study_plans_user_idx", "user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    goal: Mapped[str] = mapped_column(Text)
    exam_date: Mapped[date] = mapped_column(Date)
    availability: Mapped[list] = mapped_column(JSONB)
    read_minutes: Mapped[int] = mapped_column(Integer)
    quiz_minutes: Mapped[int] = mapped_column(Integer)
    review_minutes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StudyTask(Base):
    __tablename__ = "study_tasks"
    __table_args__ = (
        CheckConstraint("kind IN ('read','quiz','review')"),
        CheckConstraint("duration_minutes BETWEEN 1 AND 1440"),
        UniqueConstraint("plan_id", "topic_key", "kind"),
        Index("study_tasks_plan_idx", "plan_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("study_plans.id", ondelete="CASCADE"))
    topic_key: Mapped[str] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    document_id: Mapped[UUID | None] = mapped_column(ForeignKey("documents.id"))
    quiz_id: Mapped[UUID | None] = mapped_column(ForeignKey("quizzes.id"))
    page_number: Mapped[int | None] = mapped_column(Integer)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unscheduled_reason: Mapped[str | None] = mapped_column(Text)
