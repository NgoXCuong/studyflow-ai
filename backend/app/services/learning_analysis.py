from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.attempts import AttemptAnswer, QuizAttempt
from app.models.auth import User
from app.models.courses import Topic
from app.models.documents import Document
from app.models.quizzes import Quiz, QuizQuestion
from app.services.courses import get_course
from app.services.quizzes import visible_quizzes

MINIMUM_QUESTIONS = 5
REVIEW_THRESHOLD = 70


def normalize(value: str) -> str:
    return " ".join(value.split()).casefold()


def percentage(correct: int, total: int) -> float | None:
    return float((Decimal(correct) * 100 / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if total else None


def course_quiz_ids(user: User, course_id: UUID):
    return visible_quizzes(user).join(Document, Document.id == Quiz.document_id).where(
        Document.course_id == course_id, Quiz.status == "published",
    ).with_only_columns(Quiz.id)


def analyze_course(db: Session, user: User, course_id: UUID):
    course = get_course(db, user, course_id)
    quiz_ids = course_quiz_ids(user, course_id)
    topics = {}
    available = defaultdict(set)
    question_keys = {}
    references = {}
    for title in db.scalars(select(Topic.title).where(Topic.course_id == course_id).order_by(Topic.title)):
        topics.setdefault(normalize(title), " ".join(title.split()))
    catalog = db.execute(select(
        QuizQuestion.id, QuizQuestion.question, QuizQuestion.choices, QuizQuestion.correct_index, QuizQuestion.topic,
        Quiz.id.label("quiz_id"), Quiz.title.label("quiz_title"),
        Document.id.label("document_id"), Document.title.label("document_title"),
        QuizQuestion.sources[0]["page_number"].as_integer().label("page_number"),
    ).join(Quiz, Quiz.id == QuizQuestion.quiz_id).join(Document, Document.id == Quiz.document_id)
        .where(Quiz.id.in_(quiz_ids)).order_by(Quiz.created_at.desc(), Quiz.id.desc(), QuizQuestion.position))
    for row in catalog:
        topic_key = normalize(row.topic)
        topics.setdefault(topic_key, " ".join(row.topic.split()))
        key = (topic_key, normalize(row.question), tuple(sorted(normalize(choice) for choice in row.choices)),
               normalize(row.choices[row.correct_index]))
        available[topic_key].add(key)
        question_keys[row.id] = key
        references.setdefault(topic_key, {"quiz_id": row.quiz_id, "quiz_title": row.quiz_title,
            "document_id": row.document_id, "document_title": row.document_title, "page_number": row.page_number})

    # Fetch only first/latest full results per question ID, then merge equivalent copies by content.
    ordering = (QuizAttempt.submitted_at, QuizAttempt.id)
    outcomes = select(
        AttemptAnswer.question_id, AttemptAnswer.is_correct, QuizAttempt.id.label("attempt_id"), QuizAttempt.submitted_at,
        func.row_number().over(partition_by=AttemptAnswer.question_id, order_by=ordering).label("first_row"),
        func.row_number().over(partition_by=AttemptAnswer.question_id,
                               order_by=[column.desc() for column in ordering]).label("last_row"),
    ).join(QuizAttempt, QuizAttempt.id == AttemptAnswer.attempt_id).where(
        QuizAttempt.user_id == user.id, QuizAttempt.status == "submitted", QuizAttempt.scope == "full",
        QuizAttempt.quiz_id.in_(quiz_ids),
    ).subquery()
    first_results, latest_results = {}, {}
    for row in db.execute(select(outcomes).where(or_(outcomes.c.first_row == 1, outcomes.c.last_row == 1))):
        key = question_keys.get(row.question_id)
        if key is None:
            continue
        order = (row.submitted_at, row.attempt_id)
        if key not in first_results or order < first_results[key][0]:
            first_results[key] = (order, row.is_correct, row.attempt_id)
        if key not in latest_results or order > latest_results[key][0]:
            latest_results[key] = (order, row.is_correct, row.attempt_id)

    practice = defaultdict(lambda: {"count": 0, "correct": 0, "last": None})
    practice_rows = db.execute(select(
        QuizQuestion.topic, func.count().label("answer_count"),
        func.count().filter(AttemptAnswer.is_correct.is_(True)).label("correct_count"),
        func.max(QuizAttempt.submitted_at).label("last_submitted_at"),
    ).join(AttemptAnswer, AttemptAnswer.question_id == QuizQuestion.id).join(
        QuizAttempt, QuizAttempt.id == AttemptAnswer.attempt_id,
    ).where(QuizAttempt.user_id == user.id, QuizAttempt.status == "submitted", QuizAttempt.scope == "wrong_only",
            QuizAttempt.quiz_id.in_(quiz_ids)).group_by(QuizQuestion.topic))
    for row in practice_rows:
        item = practice[normalize(row.topic)]
        item["count"] += row.answer_count
        item["correct"] += row.correct_count
        item["last"] = max(item["last"], row.last_submitted_at) if item["last"] else row.last_submitted_at

    evaluated = defaultdict(list)
    for key, result in latest_results.items():
        evaluated[key[0]].append((key, result))
    result = []
    for topic_key, title in topics.items():
        answers = evaluated[topic_key]
        count = len(answers)
        correct = sum(int(answer[1]) for _, answer in answers)
        accuracy = percentage(correct, count)
        if count < MINIMUM_QUESTIONS:
            status = "insufficient_data"
            reason = f"Có {count}/{MINIMUM_QUESTIONS} câu khác nhau đã làm toàn bộ; chưa đủ dữ liệu đánh giá."
        elif correct * 100 < REVIEW_THRESHOLD * count:
            status = "needs_review"
            reason = f"Đúng {correct}/{count} câu khác nhau ({accuracy:g}%), dưới ngưỡng {REVIEW_THRESHOLD}%."
        else:
            status = "on_track"
            reason = f"Đúng {correct}/{count} câu khác nhau ({accuracy:g}%), đạt ngưỡng {REVIEW_THRESHOLD}% theo quy tắc hiện tại."
        wrong = [answer for _, answer in answers if not answer[1]]
        latest_wrong = max(wrong, key=lambda answer: answer[0]) if wrong else None
        result.append({"topic_key": topic_key, "topic": title, "status": status,
            "available_question_count": len(available[topic_key]), "question_count": count,
            "correct_count": correct, "wrong_count": count - correct, "accuracy": accuracy,
            "initial_accuracy": percentage(sum(int(first_results[key][1]) for key, _ in answers), count),
            "practice_answer_count": practice[topic_key]["count"], "practice_correct_count": practice[topic_key]["correct"],
            "last_assessed_at": max(answer[0][0] for _, answer in answers) if answers else None,
            "last_practiced_at": practice[topic_key]["last"], "reason": reason,
            **references.get(topic_key, {"quiz_id": None, "quiz_title": None, "document_id": None,
                                        "document_title": None, "page_number": None}),
            "review_attempt_id": latest_wrong[2] if latest_wrong else None})
    priority = {"needs_review": 0, "insufficient_data": 1, "on_track": 2}
    result.sort(key=lambda topic: (priority[topic["status"]], topic["accuracy"] if topic["accuracy"] is not None else -1,
                                   topic["topic_key"]))
    return {"course_id": course.id, "course_title": course.title, "minimum_questions": MINIMUM_QUESTIONS,
            "review_threshold": REVIEW_THRESHOLD, "evaluation": "latest_full_per_unique_question", "topics": result}


def topic_history(db: Session, user: User, course_id: UUID, topic: str, limit: int, offset: int):
    get_course(db, user, course_id)
    quiz_ids = course_quiz_ids(user, course_id)
    names = [name for name in db.scalars(select(QuizQuestion.topic).where(QuizQuestion.quiz_id.in_(quiz_ids)).distinct())
             if normalize(name) == normalize(topic)]
    total = func.count()
    correct = func.count().filter(AttemptAnswer.is_correct.is_(True))
    rows = db.execute(select(
        QuizAttempt.id.label("attempt_id"), Quiz.id.label("quiz_id"), Quiz.title.label("quiz_title"),
        QuizAttempt.scope, QuizAttempt.purpose, QuizAttempt.submitted_at,
        total.label("question_count"), correct.label("correct_count"),
    ).join(Quiz, Quiz.id == QuizAttempt.quiz_id).join(AttemptAnswer, AttemptAnswer.attempt_id == QuizAttempt.id).join(
        QuizQuestion, QuizQuestion.id == AttemptAnswer.question_id,
    ).where(QuizAttempt.user_id == user.id, QuizAttempt.status == "submitted", QuizAttempt.quiz_id.in_(quiz_ids),
            QuizQuestion.topic.in_(names)).group_by(QuizAttempt.id, Quiz.id)
        .order_by(QuizAttempt.submitted_at.desc(), QuizAttempt.id.desc()).limit(limit).offset(offset))
    return [{**dict(row._mapping), "accuracy": percentage(row.correct_count, row.question_count)} for row in rows]
