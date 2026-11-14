from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.attempts import AttemptOutput
from app.schemas.learning_analysis import CourseAnalysis


class PlanProgress(BaseModel):
    plan_count: int
    task_count: int
    completed_task_count: int
    unscheduled_task_count: int


class OverviewTask(BaseModel):
    id: UUID
    plan_id: UUID
    course_id: UUID
    course_title: str
    topic: str
    kind: Literal["read", "quiz", "review"]
    duration_minutes: int
    scheduled_at: datetime


class OverviewAttempt(AttemptOutput):
    course_id: UUID
    course_title: str


class StudentOverview(BaseModel):
    generated_at: datetime
    date: date
    timezone: Literal["UTC+7"] = "UTC+7"
    plan_progress: PlanProgress
    today_count: int
    overdue_count: int
    today_tasks: list[OverviewTask]
    overdue_tasks: list[OverviewTask]
    active_attempts: list[OverviewAttempt]
    recent_attempts: list[OverviewAttempt]
    analysis: CourseAnalysis | None
