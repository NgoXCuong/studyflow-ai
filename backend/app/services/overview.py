from datetime import datetime, time, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.models.attempts import QuizAttempt
from app.models.auth import User
from app.models.courses import Course
from app.models.documents import Document
from app.models.quizzes import Quiz
from app.models.study_plans import StudyPlan, StudyTask
from app.schemas.study_plans import VIETNAM_TZ
from app.services.attempts import summaries, summary_output
from app.services.courses import course_access
from app.services.documents import visible_documents
from app.services.learning_analysis import analyze_course
from app.services.quizzes import visible_quizzes

PREVIEW_LIMIT = 5


def student_overview(db: Session, user: User, course_id: UUID | None):
    now = datetime.now(timezone.utc)
    today = now.astimezone(VIETNAM_TZ).date()
    tomorrow = datetime.combine(today + timedelta(days=1), time.min, VIETNAM_TZ)
    access = (StudyPlan.user_id == user.id, Course.deleted_at.is_(None), course_access(user))
    document_ids = visible_documents(user).with_only_columns(Document.id).correlate(None)
    quiz_ids = visible_quizzes(user).with_only_columns(Quiz.id).where(Quiz.status == "published").correlate(None)
    has_source = func.coalesce(or_(
        and_(StudyTask.kind == "read", StudyTask.document_id.in_(document_ids)),
        and_(StudyTask.kind != "read", StudyTask.quiz_id.in_(quiz_ids)),
    ), False)
    has_schedule = and_(StudyTask.scheduled_at.is_not(None), StudyTask.unscheduled_reason.is_(None), has_source)
    pending = StudyTask.completed_at.is_(None)
    progress = db.execute(select(
        func.count(func.distinct(StudyPlan.id)).label("plan_count"),
        func.count(StudyTask.id).label("task_count"),
        func.count(StudyTask.id).filter(StudyTask.completed_at.is_not(None)).label("completed_task_count"),
        func.count(StudyTask.id).filter(pending, ~has_schedule).label("unscheduled_task_count"),
    ).select_from(StudyPlan).join(Course, Course.id == StudyPlan.course_id)
        .outerjoin(StudyTask, StudyTask.plan_id == StudyPlan.id).where(*access)).one()
    end_at = StudyTask.scheduled_at + StudyTask.duration_minutes * text("interval '1 minute'")
    task_query = select(StudyTask, StudyPlan.course_id, Course.title.label("course_title")).join(
        StudyPlan, StudyPlan.id == StudyTask.plan_id,
    ).join(Course, Course.id == StudyPlan.course_id).where(*access, pending, has_schedule)
    today_filter = and_(StudyTask.scheduled_at < tomorrow, end_at > now)
    overdue_filter = end_at <= now

    def agenda(condition):
        count = db.scalar(select(func.count()).select_from(task_query.where(condition).subquery()))
        rows = db.execute(task_query.where(condition).order_by(StudyTask.scheduled_at, StudyTask.id).limit(PREVIEW_LIMIT))
        return count, [{"id": row.StudyTask.id, "plan_id": row.StudyTask.plan_id,
            "course_id": row.course_id, "course_title": row.course_title, "topic": row.StudyTask.topic,
            "kind": row.StudyTask.kind, "duration_minutes": row.StudyTask.duration_minutes,
            "scheduled_at": row.StudyTask.scheduled_at} for row in rows]

    today_count, today_tasks = agenda(today_filter)
    overdue_count, overdue_tasks = agenda(overdue_filter)
    attempt_query = summaries().join(Document, Document.id == Quiz.document_id).join(
        Course, Course.id == Document.course_id,
    ).add_columns(Course.id.label("course_id"), Course.title.label("course_title")).group_by(Course.id).where(
        QuizAttempt.user_id == user.id, Quiz.id.in_(quiz_ids),
    )

    def attempts(status, order):
        rows = db.execute(attempt_query.where(QuizAttempt.status == status)
            .order_by(order.desc(), QuizAttempt.id.desc()).limit(PREVIEW_LIMIT))
        return [summary_output(row) | {"course_id": row.course_id, "course_title": row.course_title} for row in rows]

    if course_id is None:
        course_id = db.scalar(select(Course.id).where(Course.deleted_at.is_(None), course_access(user))
            .order_by(Course.created_at.desc(), Course.id).limit(1))
    return {"generated_at": now, "date": today, "plan_progress": dict(progress._mapping),
        "today_count": today_count, "overdue_count": overdue_count,
        "today_tasks": today_tasks, "overdue_tasks": overdue_tasks,
        "active_attempts": attempts("in_progress", QuizAttempt.started_at),
        "recent_attempts": attempts("submitted", QuizAttempt.submitted_at),
        "analysis": analyze_course(db, user, course_id) if course_id else None}
