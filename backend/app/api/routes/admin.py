from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import StringConstraints
from sqlalchemy import or_, select

from app.api.dependencies import Database, require_roles, require_same_origin
from app.models.admin import AdminAuditLog
from app.models.auth import User
from app.schemas.admin import AdminAuditOutput, AdminUserUpdate
from app.schemas.auth import UserOutput
from app.services import admin

router = APIRouter(prefix="/admin", tags=["admin"])
Admin = Annotated[User, Depends(require_roles("admin"))]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
Search = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


@router.get("/users", response_model=list[UserOutput])
def list_users(actor: Admin, db: Database, role: Literal["student", "teacher", "admin"] | None = None,
               status: Literal["active", "locked"] | None = None,
               q: Annotated[Search | None, Query()] = None, limit: Limit = 50, offset: Offset = 0):
    query = select(User)
    if role is not None:
        query = query.where(User.role == role)
    if status is not None:
        query = query.where(User.status == status)
    if q is not None:
        query = query.where(or_(User.full_name.icontains(q, autoescape=True),
                                User.email.icontains(q, autoescape=True)))
    return db.scalars(query.order_by(User.created_at.desc(), User.id).limit(limit).offset(offset)).all()


@router.patch("/users/{user_id}", response_model=UserOutput, dependencies=[Depends(require_same_origin)])
def update_user(user_id: UUID, data: AdminUserUpdate, actor: Admin, db: Database):
    return admin.update_user(db, actor, user_id, data)


@router.get("/audit-logs", response_model=list[AdminAuditOutput])
def list_audit_logs(actor: Admin, db: Database, actor_id: UUID | None = None,
                    target_user_id: UUID | None = None, limit: Limit = 50, offset: Offset = 0):
    query = select(AdminAuditLog)
    if actor_id is not None:
        query = query.where(AdminAuditLog.actor_id == actor_id)
    if target_user_id is not None:
        query = query.where(AdminAuditLog.target_user_id == target_user_id)
    return db.scalars(query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id)
                      .limit(limit).offset(offset)).all()
