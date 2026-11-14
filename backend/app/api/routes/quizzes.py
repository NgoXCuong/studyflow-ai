from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select

from app.api.dependencies import CurrentUser, Database, require_roles, require_same_origin
from app.models.quizzes import Quiz, QuizQuestion
from app.models.documents import Document
from app.models.attempts import QuizAttempt
from app.models.courses import Classroom, Course
from app.schemas.quizzes import QuestionInput, QuestionOutput, QuizDetail, QuizGenerateInput, QuizListOutput, QuizOutput, QuizTitleInput
from app.services.documents import get_document, visible_documents
from app.services.quizzes import copy_quiz, create_quiz, get_quiz, publish_quiz, update_question, visible_quizzes
from app.services.courses import get_classroom

router = APIRouter(tags=["quiz-authoring"], dependencies=[Depends(require_roles("student", "teacher"))])


@router.get("/quizzes", response_model=list[QuizListOutput])
def quiz_library(user: CurrentUser, db: Database,
                 scope: Literal["all", "mine", "assigned"] = "all",
                 status: Literal["draft", "published"] | None = None,
                 limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    question_count = select(func.count()).select_from(QuizQuestion).where(
        QuizQuestion.quiz_id == Quiz.id,
    ).correlate(Quiz).scalar_subquery()
    query = visible_quizzes(user).add_columns(
        Course.id.label("course_id"), Course.title.label("course_title"),
        Document.title.label("document_title"), Classroom.title.label("classroom_title"),
        question_count.label("question_count"), QuizAttempt.id.label("active_attempt_id"),
    ).join(Document, Document.id == Quiz.document_id).join(Course, Course.id == Document.course_id).outerjoin(
        Classroom, Classroom.id == Document.classroom_id,
    ).outerjoin(QuizAttempt, and_(QuizAttempt.quiz_id == Quiz.id, QuizAttempt.user_id == user.id,
                                 QuizAttempt.status == "in_progress"))
    if scope == "mine":
        query = query.where(Quiz.owner_id == user.id)
    elif scope == "assigned":
        query = query.where(Quiz.classroom_id.is_not(None), Quiz.status == "published")
    if status is not None:
        query = query.where(Quiz.status == status)
    rows = db.execute(query.order_by(Quiz.created_at.desc(), Quiz.id.desc()).limit(limit).offset(offset))
    return [{**QuizOutput.model_validate(row.Quiz).model_dump(),
             "course_id": row.course_id, "course_title": row.course_title,
             "document_title": row.document_title, "classroom_title": row.classroom_title,
             "question_count": row.question_count, "is_owner": row.Quiz.owner_id == user.id,
             "active_attempt_id": row.active_attempt_id} for row in rows]


@router.post("/documents/{document_id}/quizzes", response_model=QuizDetail, status_code=201,
             dependencies=[Depends(require_same_origin)])
def generate_quiz(document_id: UUID, data: QuizGenerateInput, user: CurrentUser, db: Database):
    quiz = create_quiz(db, user, document_id, data)
    return detail(db, quiz)


def detail(db, quiz):
    return {**QuizOutput.model_validate(quiz).model_dump(), "questions": db.scalars(
        select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.position),
    ).all()}


@router.get("/documents/{document_id}/quizzes", response_model=list[QuizOutput])
def list_quizzes(document_id: UUID, user: CurrentUser, db: Database,
                 limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    get_document(db, user, document_id)
    return db.scalars(select(Quiz).where(Quiz.document_id == document_id, Quiz.owner_id == user.id)
                      .order_by(Quiz.created_at.desc(), Quiz.id.desc()).limit(limit).offset(offset)).all()


@router.get("/quizzes/{quiz_id}", response_model=QuizDetail)
def read_quiz(quiz_id: UUID, user: CurrentUser, db: Database):
    return detail(db, get_quiz(db, user, quiz_id))


@router.patch("/quizzes/{quiz_id}", response_model=QuizOutput, dependencies=[Depends(require_same_origin)])
def rename_quiz(quiz_id: UUID, data: QuizTitleInput, user: CurrentUser, db: Database):
    quiz = get_quiz(db, user, quiz_id, lock=True, draft=True)
    quiz.title = data.title
    db.flush()
    return quiz


@router.put("/quizzes/{quiz_id}/questions/{question_id}", response_model=QuestionOutput,
            dependencies=[Depends(require_same_origin)])
def edit_question(quiz_id: UUID, question_id: UUID, data: QuestionInput, user: CurrentUser, db: Database):
    return update_question(db, user, quiz_id, question_id, data)


@router.delete("/quizzes/{quiz_id}", dependencies=[Depends(require_same_origin)])
def delete_quiz(quiz_id: UUID, user: CurrentUser, db: Database):
    db.delete(get_quiz(db, user, quiz_id, lock=True, draft=True))
    db.flush()
    return {"message": "Đã xóa quiz nháp."}


@router.post("/quizzes/{quiz_id}/publish", response_model=QuizOutput, dependencies=[Depends(require_same_origin)])
def publish(quiz_id: UUID, user: CurrentUser, db: Database):
    return publish_quiz(db, user, quiz_id)


@router.post("/quizzes/{quiz_id}/copy", response_model=QuizDetail, status_code=201,
             dependencies=[Depends(require_same_origin)])
def copy(quiz_id: UUID, user: CurrentUser, db: Database):
    return detail(db, copy_quiz(db, user, quiz_id))


@router.get("/classrooms/{classroom_id}/quizzes", response_model=list[QuizOutput])
def list_classroom_quizzes(classroom_id: UUID, user: CurrentUser, db: Database,
                          limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    get_classroom(db, user, classroom_id)
    documents = visible_documents(user).with_only_columns(Document.id)
    return db.scalars(select(Quiz).where(
        Quiz.classroom_id == classroom_id, Quiz.status == "published", Quiz.document_id.in_(documents),
    ).order_by(Quiz.published_at.desc(), Quiz.id.desc()).limit(limit).offset(offset)).all()
