from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, field_validator
from app.schemas.qa import AnswerSource

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Choice = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class QuizGenerateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title
    question_count: Annotated[StrictInt, Field(ge=1, le=10)] = 5
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    topic: Title | None = None


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: Text
    choices: list[Choice] = Field(min_length=4, max_length=4)
    correct_index: Annotated[StrictInt, Field(ge=0, le=3)]
    explanation: Text
    topic: Title
    source_ids: list[UUID] = Field(min_length=1, max_length=5)

    @field_validator("choices")
    @classmethod
    def distinct_choices(cls, values):
        if len({value.casefold() for value in values}) != 4:
            raise ValueError("Các lựa chọn phải khác nhau.")
        return values


class GeneratedQuiz(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questions: list[QuestionInput] = Field(max_length=10)


class QuizTitleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title


class QuizOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    title: str
    difficulty: Literal["easy", "medium", "hard"]
    status: Literal["draft", "published"]
    classroom_id: UUID | None
    reviewed_by: UUID | None
    published_at: datetime | None
    copied_from_id: UUID | None
    ai_generated: Literal[True] = True
    generation_model: str
    created_at: datetime
    updated_at: datetime


class QuestionOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    position: int
    question: str
    choices: list[str]
    correct_index: int
    explanation: str
    topic: str
    sources: list[AnswerSource]


class QuizDetail(QuizOutput):
    questions: list[QuestionOutput]


class QuizListOutput(QuizOutput):
    course_id: UUID
    course_title: str
    document_title: str
    classroom_title: str | None
    question_count: int
    is_owner: bool
    active_attempt_id: UUID | None
