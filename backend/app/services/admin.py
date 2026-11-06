from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin import AdminAuditLog
from app.models.auth import User
from app.schemas.admin import AdminUserUpdate
from app.services.auth import revoke_sessions


def update_user(db: Session, actor: User, user_id: UUID, data: AdminUserUpdate) -> User:
    # Cùng khóa user với đăng nhập/refresh để không tạo lại phiên trong lúc thu hồi.
    target = db.scalar(select(User).where(User.id == user_id).with_for_update()
                       .execution_options(populate_existing=True))
    if target is None:
        raise HTTPException(404, "Không tìm thấy tài khoản.")
    if target.role == "admin":
        raise HTTPException(403, "API này chỉ quản lý tài khoản sinh viên và giảng viên.")

    changes = data.model_dump(exclude_unset=True)
    if all(getattr(target, field) == value for field, value in changes.items()):
        return target

    old_role, old_status = target.role, target.status
    for field, value in changes.items():
        setattr(target, field, value)
    # Mở khóa không khôi phục phiên đã thu hồi trước đó.
    if old_role != target.role or target.status == "locked":
        revoke_sessions(db, target.id)
    db.add(AdminAuditLog(
        actor_id=actor.id, action="user_updated", target_user_id=target.id,
        old_role=old_role, new_role=target.role, old_status=old_status, new_status=target.status,
    ))
    db.flush()
    return target
