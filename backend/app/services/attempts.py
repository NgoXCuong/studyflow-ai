from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Numeric, case, cast, func, select
from sqlalchemy.orm import Session

from app.models.attempts import AttemptAnswer, QuizAttempt
from app.models.auth import User
from app.models.quizzes import Quiz, QuizQuestion
from app.schemas.attempts import AttemptStartInput
from app.services.courses import get_classroom
from app.services.documents import get_document


def playable_quiz(db: Session, user: User, quiz_id: UUID) -> Quiz:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.status == "published"))
    if quiz is None or (quiz.classroom_id is None and quiz.owner_id != user.id):
        raise HTTPException(404, "Không tìm thấy quiz đã phát hành.")
    get_document(db, user, quiz.document_id)
    if quiz.classroom_id is not None:
        get_classroom(db, user, quiz.classroom_id)
    return quiz


def report_quiz(db: Session, user: User, quiz_id: UUID) -> Quiz:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.owner_id == user.id,
                                      Quiz.classroom_id.is_not(None), Quiz.status == "published"))
    if user.role != "teacher" or quiz is None:
        raise HTTPException(404, "Không tìm thấy quiz lớp phụ trách.")
    get_classroom(db, user, quiz.classroom_id)
    get_document(db, user, quiz.document_id)
    return quiz


def get_attempt(db: Session, user: User, attempt_id: UUID, *, write=False) -> QuizAttempt:
    query = select(QuizAttempt).where(QuizAttempt.id == attempt_id)
    attempt = db.scalar(query.with_for_update() if write else query)
    if attempt is None:
        raise HTTPException(404, "Không tìm thấy lượt làm bài.")
    if user.role == "student" and attempt.user_id == user.id:
        playable_quiz(db, user, attempt.quiz_id)
    elif user.role == "teacher" and not write and attempt.status == "submitted":
        report_quiz(db, user, attempt.quiz_id)
    else:
        raise HTTPException(404, "Không tìm thấy lượt làm bài.")
    return attempt


def start_attempt(db: Session, user: User, quiz_id: UUID, data: AttemptStartInput) -> QuizAttempt:
    playable_quiz(db, user, quiz_id)
    # Serialize duplicate starts for this student; the partial unique index also enforces one active attempt.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    current = db.scalar(select(QuizAttempt).where(
        QuizAttempt.quiz_id == quiz_id, QuizAttempt.user_id == user.id, QuizAttempt.status == "in_progress",
    ))
    if current is not None:
        if (current.scope, current.purpose, current.source_attempt_id) == (data.scope, data.purpose, data.source_attempt_id):
            return current
        raise HTTPException(409, "Bạn còn lượt làm chưa nộp cho quiz này. Hãy hoàn thành lượt đó trước.")
    if data.source_attempt_id is not None:
        source = db.scalar(select(QuizAttempt).where(
            QuizAttempt.id == data.source_attempt_id, QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.user_id == user.id, QuizAttempt.status == "submitted", QuizAttempt.purpose == data.purpose,
        ))
        if source is None:
            raise HTTPException(404, "Không tìm thấy lượt đã nộp phù hợp để làm lại.")
        if data.scope == "wrong_only" and db.scalar(select(AttemptAnswer.question_id).where(
            AttemptAnswer.attempt_id == source.id, AttemptAnswer.is_correct.is_(False),
        ).limit(1)) is None:
            raise HTTPException(409, "Lượt làm này không có câu sai hoặc bỏ trống để luyện lại.")
    attempt = QuizAttempt(quiz_id=quiz_id, user_id=user.id, **data.model_dump())
    db.add(attempt)
    db.flush()
    return attempt


def summaries():
    correct = func.count(AttemptAnswer.question_id).filter(AttemptAnswer.is_correct.is_(True))
    total = func.count(AttemptAnswer.question_id)
    score = case((QuizAttempt.status == "submitted", func.round(cast(correct, Numeric) * 10 / total, 2)), else_=None)
    return select(
        QuizAttempt, Quiz.title, Quiz.document_id, Quiz.difficulty, User.full_name.label("student_name"),
        total.label("question_count"),
        func.count(AttemptAnswer.selected_index).label("answered_count"),
        case((QuizAttempt.status == "submitted", correct), else_=None).label("correct_count"),
        score.label("score"),
    ).join(Quiz, Quiz.id == QuizAttempt.quiz_id).join(User, User.id == QuizAttempt.user_id).join(
        AttemptAnswer, AttemptAnswer.attempt_id == QuizAttempt.id,
    ).group_by(QuizAttempt.id, Quiz.id, User.id)


def summary_output(row):
    attempt = row.QuizAttempt
    return {"id": attempt.id, "quiz_id": attempt.quiz_id, "title": row.title,
            "document_id": row.document_id, "scope": attempt.scope, "purpose": attempt.purpose,
            "source_attempt_id": attempt.source_attempt_id, "status": attempt.status,
            "started_at": attempt.started_at, "submitted_at": attempt.submitted_at,
            "question_count": row.question_count, "answered_count": row.answered_count,
            "correct_count": row.correct_count, "score": row.score,
            "student_id": attempt.user_id, "student_name": row.student_name}


def attempt_detail(db: Session, attempt: QuizAttempt):
    row = db.execute(summaries().where(QuizAttempt.id == attempt.id)).one()
    questions = []
    for answer, question in db.execute(select(AttemptAnswer, QuizQuestion).join(
        QuizQuestion, QuizQuestion.id == AttemptAnswer.question_id,
    ).where(AttemptAnswer.attempt_id == attempt.id).order_by(QuizQuestion.position)):
        item = {"id": question.id, "position": question.position, "question": question.question,
                "choices": question.choices, "topic": question.topic, "difficulty": row.difficulty,
                "selected_index": answer.selected_index}
        if attempt.status == "submitted":
            item.update(correct_index=question.correct_index, is_correct=answer.is_correct,
                        explanation=question.explanation, sources=question.sources)
        questions.append(item)
    return {**summary_output(row), "questions": questions}


def save_answer(db: Session, user: User, attempt_id: UUID, question_id: UUID, selected_index: int | None):
    attempt = get_attempt(db, user, attempt_id, write=True)
    if attempt.status != "in_progress":
        raise HTTPException(409, "Bài đã nộp không thể thay đổi lựa chọn.")
    answer = db.get(AttemptAnswer, (attempt_id, question_id))
    if answer is None:
        raise HTTPException(404, "Câu hỏi không thuộc lượt làm này.")
    answer.selected_index = selected_index
    db.flush()
    return attempt_detail(db, attempt)


def submit_attempt(db: Session, user: User, attempt_id: UUID):
    attempt = get_attempt(db, user, attempt_id, write=True)
    if attempt.status == "in_progress":
        attempt.status = "submitted"
        db.flush()
        db.refresh(attempt)
    return attempt_detail(db, attempt)


def quiz_statistics(db: Session, user: User, quiz_id: UUID):
    report_quiz(db, user, quiz_id)
    attempts = summaries().where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.status == "submitted").subquery()
    totals = db.execute(select(func.count(), func.count(func.distinct(attempts.c.user_id)),
                               func.round(func.avg(attempts.c.score), 2)).select_from(attempts)).one()
    rows = db.execute(select(
        QuizQuestion.id.label("question_id"), QuizQuestion.question, QuizQuestion.topic,
        func.count().label("attempt_count"),
        func.count().filter(AttemptAnswer.is_correct.is_(True)).label("correct_count"),
        func.count().filter(AttemptAnswer.is_correct.is_(False)).label("wrong_count"),
        func.count().filter(AttemptAnswer.selected_index.is_(None)).label("skipped_count"),
    ).join(AttemptAnswer, AttemptAnswer.question_id == QuizQuestion.id).join(
        QuizAttempt, QuizAttempt.id == AttemptAnswer.attempt_id,
    ).where(QuizAttempt.quiz_id == quiz_id, QuizAttempt.status == "submitted")
        .group_by(QuizQuestion.id).order_by(QuizQuestion.position))
    return {"quiz_id": quiz_id, "submitted_count": totals[0], "student_count": totals[1],
            "average_score": totals[2], "questions": [dict(row._mapping) for row in rows]}
