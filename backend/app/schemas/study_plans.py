from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

VIETNAM_TZ = timezone(timedelta(hours=7))


def exam_deadline(value: date) -> datetime:
    return datetime.combine(value, time.min, VIETNAM_TZ)


class TimeSlot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_at: AwareDatetime
    end_at: AwareDatetime

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_at <= self.start_at:
            raise ValueError("Giờ kết thúc phải sau giờ bắt đầu.")
        return self


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    exam_date: date
    availability: list[TimeSlot] = Field(min_length=1, max_length=200)
    read_minutes: int = Field(default=20, ge=1, le=1440, strict=True)
    quiz_minutes: int = Field(default=20, ge=1, le=1440, strict=True)
    review_minutes: int = Field(default=15, ge=1, le=1440, strict=True)

    @model_validator(mode="after")
    def valid_slots(self):
        slots = sorted(self.availability, key=lambda slot: slot.start_at)
        for index, slot in enumerate(slots):
            if slot.end_at > exam_deadline(self.exam_date):
                raise ValueError("Khoảng học phải kết thúc trước ngày thi theo giờ Việt Nam (UTC+7).")
            if index and slot.start_at < slots[index - 1].end_at:
                raise ValueError("Các khoảng thời gian rảnh không được trùng nhau.")
        self.availability = slots
        return self


class PlanCreate(PlanInput):
    course_id: UUID


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool | None = None
    scheduled_at: AwareDatetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440, strict=True)

    @model_validator(mode="after")
    def valid_changes(self):
        if not self.model_fields_set:
            raise ValueError("Cần cung cấp thay đổi.")
        if any(getattr(self, key) is None for key in self.model_fields_set - {"scheduled_at"}):
            raise ValueError("Trạng thái và thời lượng không được để null.")
        return self


class PlanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    course_id: UUID
    course_title: str
    goal: str
    exam_date: date
    created_at: datetime
    updated_at: datetime


class TaskOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    topic_key: str
    topic: str
    kind: Literal["read", "quiz", "review"]
    duration_minutes: int
    reason: str
    document_id: UUID | None
    quiz_id: UUID | None
    page_number: int | None
    scheduled_at: datetime | None
    completed_at: datetime | None
    unscheduled_reason: str | None


class PlanOutput(PlanSummary):
    timezone: Literal["UTC+7"] = "UTC+7"
    availability: list[TimeSlot]
    read_minutes: int
    quiz_minutes: int
    review_minutes: int
    tasks: list[TaskOutput]
