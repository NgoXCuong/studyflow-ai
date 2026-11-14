from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.courses import Course
from app.models.documents import Document
from app.models.quizzes import Quiz
from app.models.study_plans import StudyPlan, StudyTask
from app.schemas.study_plans import PlanInput, TaskUpdate, TimeSlot, exam_deadline
from app.services.courses import course_access, get_course
from app.services.documents import visible_documents
from app.services.learning_analysis import analyze_course
from app.services.quizzes import visible_quizzes

KINDS = ("read", "quiz", "review")


def lock_owner(db: Session, user: User):
    # Serialize scheduling across this student's plans, not only within one plan.
    db.scalar(select(User).where(User.id == user.id).with_for_update())


def get_plan(db: Session, user: User, plan_id: UUID, *, lock=False):
    if lock:
        lock_owner(db, user)
    plan = db.scalar(select(StudyPlan).where(StudyPlan.id == plan_id, StudyPlan.user_id == user.id))
    if plan is None:
        raise HTTPException(404, "Không tìm thấy kế hoạch.")
    get_course(db, user, plan.course_id)
    return plan


def plan_summary(plan, course_title):
    return {key: getattr(plan, key) for key in ("id", "course_id", "goal", "exam_date", "created_at", "updated_at")} | {"course_title": course_title}


def list_plans(db: Session, user: User, limit: int, offset: int):
    rows = db.execute(select(StudyPlan, Course.title).join(Course).where(
        StudyPlan.user_id == user.id, Course.deleted_at.is_(None), course_access(user),
    ).order_by(StudyPlan.created_at.desc(), StudyPlan.id.desc()).limit(limit).offset(offset))
    return [plan_summary(plan, title) for plan, title in rows]


def tasks_for(db: Session, plan: StudyPlan):
    return list(db.scalars(select(StudyTask).where(StudyTask.plan_id == plan.id).order_by(StudyTask.topic_key, StudyTask.kind)))


def accessible_sources(db: Session, user: User, tasks):
    document_ids = {task.document_id for task in tasks if task.document_id}
    quiz_ids = {task.quiz_id for task in tasks if task.quiz_id}
    documents = set(db.scalars(visible_documents(user).where(Document.id.in_(document_ids)).with_only_columns(Document.id))) if document_ids else set()
    quizzes = set(db.scalars(visible_quizzes(user).where(Quiz.id.in_(quiz_ids), Quiz.status == "published").with_only_columns(Quiz.id))) if quiz_ids else set()
    return documents, quizzes


def plan_output(db: Session, user: User, plan: StudyPlan):
    tasks = tasks_for(db, plan)
    documents, quizzes = accessible_sources(db, user, tasks)
    output = []
    for task in tasks:
        item = {column.name: getattr(task, column.name) for column in StudyTask.__table__.columns if column.name != "plan_id"}
        item["document_id"] = task.document_id if task.document_id in documents else None
        item["quiz_id"] = task.quiz_id if task.quiz_id in quizzes else None
        if not item["document_id"]:
            item["page_number"] = None
        if not (item["document_id"] if task.kind == "read" else item["quiz_id"]):
            item["unscheduled_reason"] = "Chưa có nguồn phù hợp hoặc nguồn không còn truy cập được. Bổ sung tài liệu/quiz rồi yêu cầu xếp lại."
        output.append(item)
    course = get_course(db, user, plan.course_id)
    return plan_summary(plan, course.title) | {key: getattr(plan, key) for key in (
        "availability", "read_minutes", "quiz_minutes", "review_minutes",
    )} | {"tasks": output}


def first_fit(slots, busy, duration, earliest):
    for start, end in slots:
        candidate = max(start, earliest)
        for occupied_start, occupied_end in sorted(busy):
            if occupied_end <= candidate:
                continue
            if occupied_start >= candidate + duration:
                break
            candidate = occupied_end
        if candidate + duration <= end:
            return candidate
    return None


def reschedule(db: Session, user: User, plan: StudyPlan):
    now = datetime.now(timezone.utc)
    if exam_deadline(plan.exam_date) <= now:
        raise HTTPException(422, "Ngày thi phải ở tương lai.")
    earliest = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    analysis = analyze_course(db, user, plan.course_id)
    existing = {(task.topic_key, task.kind): task for task in tasks_for(db, plan)}
    # Completed tasks remain immutable when the schedule or topic results change.
    busy = [(task.scheduled_at, task.scheduled_at + timedelta(minutes=task.duration_minutes))
            for task in db.scalars(select(StudyTask).join(StudyPlan).where(
                StudyPlan.user_id == user.id, StudyTask.scheduled_at.is_not(None),
                (StudyPlan.id != plan.id) | StudyTask.completed_at.is_not(None),
            ))]
    slots = [(TimeSlot.model_validate(slot).start_at, TimeSlot.model_validate(slot).end_at) for slot in plan.availability]
    retained = set()
    for topic in analysis["topics"]:
        after = earliest
        blocked = False
        for kind in KINDS:
            key = (topic["topic_key"], kind)
            retained.add(key)
            task = existing.get(key)
            if task and task.completed_at:
                if task.scheduled_at:
                    after = max(after, task.scheduled_at + timedelta(minutes=task.duration_minutes))
                continue
            if task is None:
                task = StudyTask(plan_id=plan.id, topic_key=topic["topic_key"], kind=kind)
                db.add(task)
            task.topic = topic["topic"]
            task.reason = topic["reason"] + " Ưu tiên: Cần ôn → Chưa đủ dữ liệu → Tạm ổn."
            task.document_id, task.quiz_id, task.page_number = topic["document_id"], topic["quiz_id"], topic["page_number"]
            task.duration_minutes = task.duration_minutes or getattr(plan, {"read": "read_minutes", "quiz": "quiz_minutes", "review": "review_minutes"}[kind])
            task.scheduled_at = None
            resource = task.document_id if kind == "read" else task.quiz_id
            if not resource:
                task.unscheduled_reason = "Chưa có tài liệu/quiz phù hợp với chủ đề."
            elif blocked:
                task.unscheduled_reason = "Chưa xếp được bước trước của chủ đề này."
            else:
                duration = timedelta(minutes=task.duration_minutes)
                task.scheduled_at = first_fit(slots, busy, duration, after)
                task.unscheduled_reason = None if task.scheduled_at else "Không còn khoảng rảnh đủ dài trước ngày thi; nhiệm vụ không được chia nhỏ."
                if task.scheduled_at:
                    after = task.scheduled_at + duration
                    busy.append((task.scheduled_at, after))
            blocked = task.scheduled_at is None
    for key, task in existing.items():
        if key not in retained and task.completed_at is None:
            task.scheduled_at = None
            task.unscheduled_reason = "Chủ đề hoặc nguồn không còn trong phân tích M11; nhiệm vụ được giữ để bạn đối chiếu."
    plan.updated_at = now
    db.flush()


def configure_plan(plan: StudyPlan, data: PlanInput):
    for key in ("goal", "exam_date", "read_minutes", "quiz_minutes", "review_minutes"):
        setattr(plan, key, getattr(data, key))
    plan.availability = [slot.model_dump(mode="json") for slot in data.availability]


def create_plan(db: Session, user: User, data):
    lock_owner(db, user)
    get_course(db, user, data.course_id)
    if any(slot.start_at < datetime.now(timezone.utc) for slot in data.availability):
        raise HTTPException(422, "Thời gian rảnh của kế hoạch mới phải ở tương lai.")
    plan = StudyPlan(user_id=user.id, course_id=data.course_id)
    configure_plan(plan, data)
    db.add(plan)
    db.flush()
    reschedule(db, user, plan)
    return plan_output(db, user, plan)


def update_task(db: Session, user: User, plan: StudyPlan, task_id: UUID, data: TaskUpdate):
    tasks = tasks_for(db, plan)
    task = next((item for item in tasks if item.id == task_id), None)
    if task is None:
        raise HTTPException(404, "Không tìm thấy nhiệm vụ trong kế hoạch.")
    changes = data.model_fields_set
    if task.completed_at and changes - {"completed"}:
        raise HTTPException(409, "Bỏ đánh dấu hoàn thành trước khi chỉnh sửa nhiệm vụ.")
    documents, quizzes = accessible_sources(db, user, [task])
    if not (task.document_id in documents if task.kind == "read" else task.quiz_id in quizzes):
        raise HTTPException(409, "Nguồn nhiệm vụ chưa có hoặc không còn truy cập được. Hãy xếp lại kế hoạch.")
    start = data.scheduled_at if "scheduled_at" in changes else task.scheduled_at
    minutes = data.duration_minutes if "duration_minutes" in changes else task.duration_minutes
    if "scheduled_at" in changes and start is None and any(
        item.topic_key == task.topic_key and KINDS.index(item.kind) > KINDS.index(task.kind)
        and item.scheduled_at is not None and item.completed_at is None for item in tasks
    ):
        raise HTTPException(409, "Bỏ lịch bước sau trước khi bỏ lịch bước trước của chủ đề.")
    if changes - {"completed"} and start is not None:
        end = start + timedelta(minutes=minutes)
        if start < datetime.now(timezone.utc) or end > exam_deadline(plan.exam_date):
            raise HTTPException(422, "Nhiệm vụ phải ở tương lai và kết thúc trước ngày thi.")
        if not any(TimeSlot.model_validate(slot).start_at <= start and end <= TimeSlot.model_validate(slot).end_at for slot in plan.availability):
            raise HTTPException(422, "Nhiệm vụ phải nằm trọn trong một khoảng thời gian rảnh.")
        busy = db.scalars(select(StudyTask).join(StudyPlan).where(
            StudyPlan.user_id == user.id, StudyTask.id != task.id, StudyTask.scheduled_at.is_not(None),
        ))
        if any(start < item.scheduled_at + timedelta(minutes=item.duration_minutes) and item.scheduled_at < end for item in busy):
            raise HTTPException(409, "Thời gian bị trùng với nhiệm vụ khác của bạn.")
        for item in tasks:
            if item.topic_key != task.topic_key or item.id == task.id:
                continue
            if KINDS.index(item.kind) < KINDS.index(task.kind) and item.completed_at is None:
                if item.scheduled_at is None or item.scheduled_at + timedelta(minutes=item.duration_minutes) > start:
                    raise HTTPException(409, "Cần xếp sau bước trước của cùng chủ đề.")
            if KINDS.index(item.kind) > KINDS.index(task.kind) and item.scheduled_at and end > item.scheduled_at:
                raise HTTPException(409, "Thời gian lấn sang bước tiếp theo của cùng chủ đề.")
    if data.completed and start is None:
        raise HTTPException(409, "Hãy xếp lịch nhiệm vụ trước khi đánh dấu hoàn thành.")
    task.scheduled_at, task.duration_minutes = start, minutes
    if "completed" in changes:
        task.completed_at = (task.completed_at or datetime.now(timezone.utc)) if data.completed else None
    task.unscheduled_reason = None if start else "Chưa xếp lịch; chọn thời gian hoặc yêu cầu xếp lại."
    plan.updated_at = datetime.now(timezone.utc)
    db.flush()
    return plan_output(db, user, plan)
