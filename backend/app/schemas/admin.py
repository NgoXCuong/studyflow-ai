from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["student", "teacher"] | None = None
    status: Literal["active", "locked"] | None = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Cần cung cấp vai trò hoặc trạng thái để cập nhật.")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Vai trò và trạng thái không được để null.")
        return self


class AdminAuditOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID
    action: str
    target_user_id: UUID | None
    old_role: str | None
    new_role: str | None
    old_status: str | None
    new_status: str | None
    created_at: datetime
