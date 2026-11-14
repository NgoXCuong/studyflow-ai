from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import CurrentUser, Database, require_roles, require_same_origin
from app.models.attempts import QuizAttempt
from app.schemas.attempts import AnswerInput, AttemptDetail, AttemptOutput, AttemptStartInput, QuizStatistics, StudentAttemptOutput
from app.schemas.quizzes import QuizOutput
from app.services import attempts
from app.services.quizzes import visible_quizzes
from app.models.quizzes import Quiz

router = APIRouter(tags=["quiz-attempts"], dependencies=[Depends(require_roles("student", "teacher"))])
student = [Depends(require_roles("student"))]
mutation = [*student, Depends(require_same_origin)]


@router.get("/attempts/me", response_model=list[AttemptOutput], dependencies=student)
def my_attempts(user: CurrentUser, db: Database,
                status: Literal["in_progress", "submitted"] | None = None,
                limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    quiz_ids = visible_quizzes(user).with_only_columns(Quiz.id).where(Quiz.status == "published")
    query = attempts.summaries().where(QuizAttempt.user_id == user.id, QuizAttempt.quiz_id.in_(quiz_ids))
    if status is not None:
        query = query.where(QuizAttempt.status == status)
    rows = db.execute(query.order_by(QuizAttempt.started_at.desc(), QuizAttempt.id.desc()).limit(limit).offset(offset))
    return [attempts.summary_output(row) for row in rows]


@router.get("/quizzes/{quiz_id}/practice", response_model=QuizOutput, dependencies=student)
def practice(quiz_id: UUID, user: CurrentUser, db: Database):
    return attempts.playable_quiz(db, user, quiz_id)


@router.post("/quizzes/{quiz_id}/attempts", response_model=AttemptDetail, response_model_exclude_unset=True,
             dependencies=mutation)
def start(quiz_id: UUID, data: AttemptStartInput, user: CurrentUser, db: Database):
    return attempts.attempt_detail(db, attempts.start_attempt(db, user, quiz_id, data))


@router.get("/quizzes/{quiz_id}/attempts/me", response_model=list[AttemptOutput], dependencies=student)
def history(quiz_id: UUID, user: CurrentUser, db: Database,
            limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    attempts.playable_quiz(db, user, quiz_id)
    rows = db.execute(attempts.summaries().where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.user_id == user.id)
                      .order_by(QuizAttempt.started_at.desc(), QuizAttempt.id.desc()).limit(limit).offset(offset))
    return [attempts.summary_output(row) for row in rows]


@router.get("/attempts/{attempt_id}", response_model=AttemptDetail, response_model_exclude_unset=True)
def read(attempt_id: UUID, user: CurrentUser, db: Database):
    return attempts.attempt_detail(db, attempts.get_attempt(db, user, attempt_id))


@router.put("/attempts/{attempt_id}/answers/{question_id}", response_model=AttemptDetail,
            response_model_exclude_unset=True, dependencies=mutation)
def save(attempt_id: UUID, question_id: UUID, data: AnswerInput, user: CurrentUser, db: Database):
    return attempts.save_answer(db, user, attempt_id, question_id, data.selected_index)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptDetail,
             response_model_exclude_unset=True, dependencies=mutation)
def submit(attempt_id: UUID, user: CurrentUser, db: Database):
    return attempts.submit_attempt(db, user, attempt_id)


@router.get("/quizzes/{quiz_id}/results", response_model=list[StudentAttemptOutput],
            dependencies=[Depends(require_roles("teacher"))])
def results(quiz_id: UUID, user: CurrentUser, db: Database,
            limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    attempts.report_quiz(db, user, quiz_id)
    rows = db.execute(attempts.summaries().where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.status == "submitted")
                      .order_by(QuizAttempt.submitted_at.desc(), QuizAttempt.id.desc()).limit(limit).offset(offset))
    return [attempts.summary_output(row) for row in rows]


@router.get("/quizzes/{quiz_id}/statistics", response_model=QuizStatistics,
            dependencies=[Depends(require_roles("teacher"))])
def statistics(quiz_id: UUID, user: CurrentUser, db: Database):
    return attempts.quiz_statistics(db, user, quiz_id)
