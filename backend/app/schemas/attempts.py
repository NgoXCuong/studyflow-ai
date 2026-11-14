from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from app.schemas.qa import AnswerSource


class AttemptStartInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["full", "wrong_only"] = "full"
    purpose: Literal["practice", "diagnostic"] = "practice"
    source_attempt_id: UUID | None = None

    @model_validator(mode="after")
    def require_source(self):
        if self.scope == "wrong_only" and self.source_attempt_id is None:
            raise ValueError("Luyện câu sai cần có lượt làm đã nộp.")
        return self


class AnswerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    selected_index: Annotated[StrictInt, Field(ge=0, le=3)] | None


class AttemptOutput(BaseModel):
    id: UUID
    quiz_id: UUID
    title: str
    document_id: UUID
    scope: Literal["full", "wrong_only"]
    purpose: Literal["practice", "diagnostic"]
    source_attempt_id: UUID | None
    status: Literal["in_progress", "submitted"]
    started_at: datetime
    submitted_at: datetime | None
    question_count: int
    answered_count: int
    correct_count: int | None
    score: float | None


class AttemptQuestion(BaseModel):
    id: UUID
    position: int
    question: str
    choices: list[str]
    topic: str
    difficulty: str
    selected_index: int | None
    correct_index: int | None = None
    is_correct: bool | None = None
    explanation: str | None = None
    sources: list[AnswerSource] | None = None


class AttemptDetail(AttemptOutput):
    questions: list[AttemptQuestion]


class StudentAttemptOutput(AttemptOutput):
    student_id: UUID
    student_name: str


class QuestionStatistics(BaseModel):
    question_id: UUID
    question: str
    topic: str
    attempt_count: int
    correct_count: int
    wrong_count: int
    skipped_count: int


class QuizStatistics(BaseModel):
    quiz_id: UUID
    submitted_count: int
    student_count: int
    average_score: float | None
    questions: list[QuestionStatistics]
