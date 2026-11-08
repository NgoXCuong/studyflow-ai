from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing import Annotated


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class AnswerSource(BaseModel):
    chunk_id: UUID
    document_id: UUID
    title: str
    page_number: int
    content: str


class AnswerOutput(BaseModel):
    answer: str
    insufficient_evidence: bool
    sources: list[AnswerSource] = Field(default_factory=list)


class ConversationTitleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ConversationOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    title: str
    created_at: datetime
    updated_at: datetime


class TurnOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    question: str
    answer: AnswerOutput
    created_at: datetime
