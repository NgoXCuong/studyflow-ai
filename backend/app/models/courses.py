from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("kind IN ('personal','teaching')"),
        CheckConstraint("btrim(title) <> ''"),
        Index("courses_owner_idx", "owner_id", postgresql_where=text("deleted_at IS NULL")),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Classroom(Base):
    __tablename__ = "classrooms"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''"),
        CheckConstraint("join_code_hash IS NULL OR btrim(join_code_hash) <> ''"),
        CheckConstraint("NOT join_enabled OR join_code_hash IS NOT NULL"),
        UniqueConstraint("id", "course_id"),
        Index("classrooms_course_idx", "course_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(Text)
    join_code_hash: Mapped[str | None] = mapped_column(Text, unique=True)
    join_enabled: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ClassroomMember(Base):
    __tablename__ = "classroom_members"
    __table_args__ = (
        CheckConstraint("left_at IS NULL OR left_at >= joined_at"),
        Index("classroom_members_student_idx", "student_id", "classroom_id"),
    )

    classroom_id: Mapped[UUID] = mapped_column(ForeignKey("classrooms.id"), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''"),
        CheckConstraint("position >= 0"),
        UniqueConstraint("id", "course_id"),
        Index("chapters_course_idx", "course_id", "position"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        CheckConstraint("btrim(title) <> ''"),
        UniqueConstraint("id", "course_id"),
        ForeignKeyConstraint(["chapter_id", "course_id"], ["chapters.id", "chapters.course_id"]),
        Index("topics_course_idx", "course_id"),
        Index("topics_chapter_idx", "chapter_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    chapter_id: Mapped[UUID | None] = mapped_column(Uuid)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
