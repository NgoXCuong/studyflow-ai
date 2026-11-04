from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(btrim(email)) AND email <> ''", name="users_email_check"),
        CheckConstraint("btrim(password_hash) <> ''", name="users_password_hash_check"),
        CheckConstraint("btrim(full_name) <> ''", name="users_full_name_check"),
        CheckConstraint("role IN ('student','teacher','admin')", name="users_role_check"),
        CheckConstraint("status IN ('active','locked')", name="users_status_check"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, server_default=text("'student'"))
    status: Mapped[str] = mapped_column(Text, server_default=text("'active'"))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint("btrim(refresh_token_hash) <> ''", name="auth_sessions_refresh_token_hash_check"),
        CheckConstraint("expires_at > created_at", name="auth_sessions_check"),
        CheckConstraint("revoked_at IS NULL OR revoked_at >= created_at", name="auth_sessions_check1"),
        Index("auth_sessions_user_idx", "user_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    refresh_token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    __table_args__ = (
        CheckConstraint("purpose IN ('email_verification','password_reset')", name="auth_tokens_purpose_check"),
        CheckConstraint("btrim(token_hash) <> ''", name="auth_tokens_token_hash_check"),
        CheckConstraint("expires_at > created_at", name="auth_tokens_check"),
        CheckConstraint("consumed_at IS NULL OR consumed_at >= created_at", name="auth_tokens_check1"),
        Index("auth_tokens_user_idx", "user_id", "purpose"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    purpose: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
