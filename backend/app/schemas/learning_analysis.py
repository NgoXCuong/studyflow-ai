from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class TopicAnalysis(BaseModel):
    topic_key: str
    topic: str
    status: Literal["insufficient_data", "needs_review", "on_track"]
    available_question_count: int
    question_count: int
    correct_count: int
    wrong_count: int
    accuracy: float | None
    initial_accuracy: float | None
    practice_answer_count: int
    practice_correct_count: int
    last_assessed_at: datetime | None
    last_practiced_at: datetime | None
    reason: str
    document_id: UUID | None
    document_title: str | None
    page_number: int | None
    quiz_id: UUID | None
    quiz_title: str | None
    review_attempt_id: UUID | None


class CourseAnalysis(BaseModel):
    course_id: UUID
    course_title: str
    minimum_questions: int
    review_threshold: int
    evaluation: Literal["latest_full_per_unique_question"]
    topics: list[TopicAnalysis]


class TopicHistory(BaseModel):
    attempt_id: UUID
    quiz_id: UUID
    quiz_title: str
    scope: Literal["full", "wrong_only"]
    purpose: Literal["practice", "diagnostic"]
    submitted_at: datetime
    question_count: int
    correct_count: int
    accuracy: float
