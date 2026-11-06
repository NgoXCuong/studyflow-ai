from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text)
    target_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    old_role: Mapped[str | None] = mapped_column(Text)
    new_role: Mapped[str | None] = mapped_column(Text)
    old_status: Mapped[str | None] = mapped_column(Text)
    new_status: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("btrim(action) <> ''"),
        CheckConstraint("old_role IN ('student','teacher','admin')"),
        CheckConstraint("new_role IN ('student','teacher','admin')"),
        CheckConstraint("old_status IN ('active','locked')"),
        CheckConstraint("new_status IN ('active','locked')"),
        Index("admin_audit_logs_actor_idx", actor_id, created_at.desc()),
        Index("admin_audit_logs_target_idx", target_user_id, created_at.desc()),
    )
