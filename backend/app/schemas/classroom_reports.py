from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class QuizReport(BaseModel):
    quiz_id: UUID
    title: str
    document_id: UUID
    published_at: datetime
    question_count: int
    submitted_count: int
    student_count: int
    current_submitted_count: int
    current_not_submitted_count: int
    average_score: float | None


class TopicReport(BaseModel):
    topic_key: str
    topic: str
    answer_count: int
    correct_count: int
    wrong_count: int
    skipped_count: int
    accuracy: float | None


class ClassroomReport(BaseModel):
    classroom_id: UUID
    classroom_title: str
    course_id: UUID
    course_title: str
    current_member_count: int
    quiz_count: int
    submitted_count: int
    quizzes: list[QuizReport]
    topics: list[TopicReport]


class StudentReport(BaseModel):
    student_id: UUID
    full_name: str
    joined_at: datetime
    left_at: datetime | None
    submitted_quiz_count: int
    submitted_count: int
    average_score: float | None
    last_submitted_at: datetime | None
