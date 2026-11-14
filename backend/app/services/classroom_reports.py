from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.attempts import AttemptAnswer, QuizAttempt
from app.models.auth import User
from app.models.courses import ClassroomMember, Course
from app.models.quizzes import Quiz, QuizQuestion
from app.services.attempts import summaries, summary_output
from app.services.courses import get_classroom
from app.services.learning_analysis import normalize, percentage
from app.services.quizzes import visible_quizzes


def report_quiz_ids(user: User, classroom_id: UUID):
    return visible_quizzes(user).where(Quiz.classroom_id == classroom_id, Quiz.status == "published").with_only_columns(Quiz.id)


def submitted_attempts(user: User, classroom_id: UUID):
    return summaries().where(QuizAttempt.quiz_id.in_(report_quiz_ids(user, classroom_id)), QuizAttempt.status == "submitted")


def classroom_report(db: Session, user: User, classroom_id: UUID, limit: int, offset: int):
    classroom = get_classroom(db, user, classroom_id)
    course = db.get(Course, classroom.course_id)
    quiz_ids = report_quiz_ids(user, classroom_id)
    current_members = select(ClassroomMember.student_id).where(
        ClassroomMember.classroom_id == classroom_id, ClassroomMember.left_at.is_(None),
    )
    member_count = db.scalar(select(func.count()).select_from(current_members.subquery()))
    submitted = submitted_attempts(user, classroom_id).subquery()
    per_quiz = select(
        submitted.c.quiz_id,
        func.count().label("submitted_count"),
        func.count(func.distinct(submitted.c.user_id)).label("student_count"),
        func.count(func.distinct(submitted.c.user_id)).filter(submitted.c.user_id.in_(current_members)).label("current_submitted_count"),
        func.round(func.avg(submitted.c.score), 2).label("average_score"),
    ).group_by(submitted.c.quiz_id).subquery()
    question_counts = select(QuizQuestion.quiz_id, func.count().label("question_count")).where(
        QuizQuestion.quiz_id.in_(quiz_ids),
    ).group_by(QuizQuestion.quiz_id).subquery()
    rows = db.execute(select(
        Quiz.id.label("quiz_id"), Quiz.title, Quiz.document_id, Quiz.published_at,
        func.coalesce(question_counts.c.question_count, 0).label("question_count"),
        func.coalesce(per_quiz.c.submitted_count, 0).label("submitted_count"),
        func.coalesce(per_quiz.c.student_count, 0).label("student_count"),
        func.coalesce(per_quiz.c.current_submitted_count, 0).label("current_submitted_count"),
        (member_count - func.coalesce(per_quiz.c.current_submitted_count, 0)).label("current_not_submitted_count"),
        per_quiz.c.average_score,
    ).outerjoin(per_quiz, per_quiz.c.quiz_id == Quiz.id).outerjoin(question_counts, question_counts.c.quiz_id == Quiz.id)
        .where(Quiz.id.in_(quiz_ids)).order_by(Quiz.published_at.desc(), Quiz.id.desc()).limit(limit).offset(offset))
    topics = {}
    topic_rows = db.execute(select(
        QuizQuestion.topic, func.count().label("answer_count"),
        func.count().filter(AttemptAnswer.is_correct.is_(True)).label("correct_count"),
        func.count().filter(AttemptAnswer.is_correct.is_(False)).label("wrong_count"),
        func.count().filter(AttemptAnswer.selected_index.is_(None)).label("skipped_count"),
    ).join(AttemptAnswer, AttemptAnswer.question_id == QuizQuestion.id).join(
        QuizAttempt, QuizAttempt.id == AttemptAnswer.attempt_id,
    ).where(QuizAttempt.quiz_id.in_(quiz_ids), QuizAttempt.status == "submitted").group_by(QuizQuestion.topic))
    for row in topic_rows:
        key = normalize(row.topic)
        topic = topics.setdefault(key, {"topic_key": key, "topic": " ".join(row.topic.split()),
            "answer_count": 0, "correct_count": 0, "wrong_count": 0, "skipped_count": 0})
        for field in ("answer_count", "correct_count", "wrong_count", "skipped_count"):
            topic[field] += getattr(row, field)
    for topic in topics.values():
        topic["accuracy"] = percentage(topic["correct_count"], topic["answer_count"])
    return {"classroom_id": classroom.id, "classroom_title": classroom.title,
        "course_id": course.id, "course_title": course.title,
        "current_member_count": member_count,
        "quiz_count": db.scalar(select(func.count()).select_from(quiz_ids.subquery())),
        "submitted_count": db.scalar(select(func.count()).select_from(submitted)),
        "quizzes": [dict(row._mapping) for row in rows],
        "topics": sorted(topics.values(), key=lambda topic: (topic["accuracy"], topic["topic_key"]))}


def student_reports(db: Session, user: User, classroom_id: UUID, include_left: bool, limit: int, offset: int):
    get_classroom(db, user, classroom_id)
    submitted = submitted_attempts(user, classroom_id).subquery()
    per_student = select(
        submitted.c.user_id, func.count().label("submitted_count"),
        func.count(func.distinct(submitted.c.quiz_id)).label("submitted_quiz_count"),
        func.round(func.avg(submitted.c.score), 2).label("average_score"),
        func.max(submitted.c.submitted_at).label("last_submitted_at"),
    ).group_by(submitted.c.user_id).subquery()
    query = select(
        ClassroomMember.student_id, User.full_name, ClassroomMember.joined_at, ClassroomMember.left_at,
        func.coalesce(per_student.c.submitted_count, 0).label("submitted_count"),
        func.coalesce(per_student.c.submitted_quiz_count, 0).label("submitted_quiz_count"),
        per_student.c.average_score, per_student.c.last_submitted_at,
    ).join(User, User.id == ClassroomMember.student_id).outerjoin(per_student, per_student.c.user_id == ClassroomMember.student_id)
    query = query.where(ClassroomMember.classroom_id == classroom_id)
    if not include_left:
        query = query.where(ClassroomMember.left_at.is_(None))
    rows = db.execute(query.order_by(User.full_name, ClassroomMember.student_id).limit(limit).offset(offset))
    return [dict(row._mapping) for row in rows]


def report_attempts(db: Session, user: User, classroom_id: UUID, student_id: UUID | None, limit: int, offset: int):
    get_classroom(db, user, classroom_id)
    if student_id is not None and db.get(ClassroomMember, (classroom_id, student_id)) is None:
        raise HTTPException(404, "Không tìm thấy sinh viên trong lớp.")
    query = submitted_attempts(user, classroom_id)
    if student_id is not None:
        query = query.where(QuizAttempt.user_id == student_id)
    rows = db.execute(query.order_by(QuizAttempt.submitted_at.desc(), QuizAttempt.id.desc()).limit(limit).offset(offset))
    return [summary_output(row) for row in rows]
