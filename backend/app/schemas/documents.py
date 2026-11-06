from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.courses import Title


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    chapter_id: UUID | None = None
    published: bool | None = None

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Cần cung cấp ít nhất một trường để cập nhật.")
        for field in self.model_fields_set - {"chapter_id"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} không được để null.")
        return self


class DocumentOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    owner_id: UUID
    classroom_id: UUID | None
    chapter_id: UUID | None
    title: str
    original_filename: str
    mime_type: str
    size_bytes: int
    page_count: int | None
    status: Literal["queued", "processing", "ready", "failed"]
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
