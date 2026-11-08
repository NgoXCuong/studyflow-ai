from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.dependencies import CurrentUser, Database, require_roles, require_same_origin
from app.models.quizzes import Quiz, QuizQuestion
from app.schemas.quizzes import QuestionInput, QuestionOutput, QuizDetail, QuizGenerateInput, QuizOutput, QuizTitleInput
from app.services.documents import get_document
from app.services.quizzes import create_quiz, get_quiz, update_question

router = APIRouter(tags=["quiz-authoring"], dependencies=[Depends(require_roles("student", "teacher"))])


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
    quiz = get_quiz(db, user, quiz_id, lock=True)
    quiz.title = data.title
    db.flush()
    return quiz


@router.put("/quizzes/{quiz_id}/questions/{question_id}", response_model=QuestionOutput,
            dependencies=[Depends(require_same_origin)])
def edit_question(quiz_id: UUID, question_id: UUID, data: QuestionInput, user: CurrentUser, db: Database):
    return update_question(db, user, quiz_id, question_id, data)


@router.delete("/quizzes/{quiz_id}", dependencies=[Depends(require_same_origin)])
def delete_quiz(quiz_id: UUID, user: CurrentUser, db: Database):
    db.delete(get_quiz(db, user, quiz_id, lock=True))
    db.flush()
    return {"message": "Đã xóa quiz nháp."}
