from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class CourseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatchInput(CourseInput):
    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Cần cung cấp ít nhất một trường để cập nhật.")
        for field in self.model_fields_set - {"description", "chapter_id"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} không được để null.")
        return self


class CourseCreate(CourseInput):
    title: Title
    kind: Literal["personal", "teaching"] = "personal"
    description: Description | None = None


class CourseUpdate(PatchInput):
    title: Title | None = None
    description: Description | None = None


class CourseOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    kind: Literal["personal", "teaching"]
    title: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ChapterCreate(CourseInput):
    title: Title
    position: int = Field(default=0, ge=0)


class ChapterUpdate(PatchInput):
    title: Title | None = None
    position: int | None = Field(default=None, ge=0)


class ChapterOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    title: str
    position: int


class TopicCreate(CourseInput):
    title: Title
    chapter_id: UUID | None = None
    description: Description | None = None


class TopicUpdate(PatchInput):
    title: Title | None = None
    chapter_id: UUID | None = None
    description: Description | None = None


class TopicOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    chapter_id: UUID | None
    title: str
    description: str | None


class ClassroomCreate(CourseInput):
    title: Title


class ClassroomUpdate(PatchInput):
    title: Title | None = None
    join_enabled: bool | None = None


class ClassroomOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    title: str
    join_enabled: bool
    created_at: datetime
    updated_at: datetime


class JoinCodeOutput(BaseModel):
    join_code: str


class JoinClassroomInput(CourseInput):
    join_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=16, max_length=128)]


class MemberOutput(BaseModel):
    student_id: UUID
    full_name: str
    joined_at: datetime
    left_at: datetime | None
