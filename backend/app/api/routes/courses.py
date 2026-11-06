from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, select

from app.api.dependencies import CurrentUser, Database, require_same_origin
from app.models.courses import Chapter, Classroom, Course, Topic
from app.models.documents import Document
from app.schemas.auth import MessageOutput
from app.schemas.courses import (
    ChapterCreate, ChapterOutput, ChapterUpdate, ClassroomCreate, ClassroomOutput,
    CourseCreate, CourseOutput, CourseUpdate, TopicCreate, TopicOutput, TopicUpdate,
)
from app.services.courses import course_access, get_chapter, get_course, get_topic

router = APIRouter(prefix="/courses", tags=["courses"])
mutation = [Depends(require_same_origin)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("", response_model=list[CourseOutput])
def list_courses(user: CurrentUser, db: Database, limit: Limit = 50, offset: Offset = 0):
    return db.scalars(select(Course).where(
        Course.deleted_at.is_(None), course_access(user),
    ).order_by(Course.created_at.desc(), Course.id).limit(limit).offset(offset)).all()


@router.post("", response_model=CourseOutput, status_code=201, dependencies=mutation)
def create_course(data: CourseCreate, user: CurrentUser, db: Database):
    if (data.kind == "personal" and user.role != "student") or (
        data.kind == "teaching" and user.role != "teacher"
    ):
        raise HTTPException(403, "Vai trò của bạn không được tạo loại môn học này.")
    course = Course(owner_id=user.id, **data.model_dump())
    db.add(course)
    db.flush()
    return course


@router.get("/{course_id}", response_model=CourseOutput)
def read_course(course_id: UUID, user: CurrentUser, db: Database):
    return get_course(db, user, course_id)


@router.patch("/{course_id}", response_model=CourseOutput, dependencies=mutation)
def update_course(course_id: UUID, data: CourseUpdate, user: CurrentUser, db: Database):
    course = get_course(db, user, course_id, write=True)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(course, field, value)
    db.flush()
    return course


@router.delete("/{course_id}", response_model=MessageOutput, dependencies=mutation)
def delete_course(course_id: UUID, user: CurrentUser, db: Database):
    course = get_course(db, user, course_id, write=True)
    course.deleted_at = func.now()
    return {"message": "Đã xóa môn học."}


@router.get("/{course_id}/chapters", response_model=list[ChapterOutput])
def list_chapters(course_id: UUID, user: CurrentUser, db: Database, limit: Limit = 50, offset: Offset = 0):
    get_course(db, user, course_id)
    return db.scalars(select(Chapter).where(Chapter.course_id == course_id).order_by(
        Chapter.position, Chapter.id,
    ).limit(limit).offset(offset)).all()


@router.post("/{course_id}/chapters", response_model=ChapterOutput, status_code=201, dependencies=mutation)
def create_chapter(course_id: UUID, data: ChapterCreate, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    chapter = Chapter(course_id=course_id, **data.model_dump())
    db.add(chapter)
    db.flush()
    return chapter


@router.patch("/{course_id}/chapters/{chapter_id}", response_model=ChapterOutput, dependencies=mutation)
def update_chapter(course_id: UUID, chapter_id: UUID, data: ChapterUpdate, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    chapter = get_chapter(db, course_id, chapter_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, field, value)
    db.flush()
    return chapter


@router.delete("/{course_id}/chapters/{chapter_id}", response_model=MessageOutput, dependencies=mutation)
def delete_chapter(course_id: UUID, chapter_id: UUID, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    chapter = get_chapter(db, course_id, chapter_id)
    if db.scalar(select(exists().where(Topic.chapter_id == chapter_id))):
        raise HTTPException(409, "Cần chuyển hoặc xóa chủ đề thuộc chương trước.")
    if db.scalar(select(exists().where(Document.chapter_id == chapter_id))):
        raise HTTPException(409, "Chương còn được tài liệu tham chiếu, kể cả tài liệu đã xóa mềm.")
    db.delete(chapter)
    return {"message": "Đã xóa chương."}


@router.get("/{course_id}/topics", response_model=list[TopicOutput])
def list_topics(course_id: UUID, user: CurrentUser, db: Database, chapter_id: UUID | None = None,
                limit: Limit = 50, offset: Offset = 0):
    get_course(db, user, course_id)
    query = select(Topic).where(Topic.course_id == course_id)
    if chapter_id is not None:
        get_chapter(db, course_id, chapter_id)
        query = query.where(Topic.chapter_id == chapter_id)
    return db.scalars(query.order_by(Topic.title, Topic.id).limit(limit).offset(offset)).all()


@router.post("/{course_id}/topics", response_model=TopicOutput, status_code=201, dependencies=mutation)
def create_topic(course_id: UUID, data: TopicCreate, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    if data.chapter_id is not None:
        get_chapter(db, course_id, data.chapter_id)
    topic = Topic(course_id=course_id, **data.model_dump())
    db.add(topic)
    db.flush()
    return topic


@router.patch("/{course_id}/topics/{topic_id}", response_model=TopicOutput, dependencies=mutation)
def update_topic(course_id: UUID, topic_id: UUID, data: TopicUpdate, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    topic = get_topic(db, course_id, topic_id)
    if data.chapter_id is not None:
        get_chapter(db, course_id, data.chapter_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(topic, field, value)
    db.flush()
    return topic


@router.delete("/{course_id}/topics/{topic_id}", response_model=MessageOutput, dependencies=mutation)
def delete_topic(course_id: UUID, topic_id: UUID, user: CurrentUser, db: Database):
    get_course(db, user, course_id, write=True)
    db.delete(get_topic(db, course_id, topic_id))
    return {"message": "Đã xóa chủ đề."}


@router.post("/{course_id}/classrooms", response_model=ClassroomOutput, status_code=201, dependencies=mutation)
def create_classroom(course_id: UUID, data: ClassroomCreate, user: CurrentUser, db: Database):
    course = get_course(db, user, course_id, write=True)
    if user.role != "teacher" or course.kind != "teaching":
        raise HTTPException(403, "Chỉ giảng viên được tạo lớp trong môn giảng dạy phụ trách.")
    classroom = Classroom(course_id=course_id, title=data.title)
    db.add(classroom)
    db.flush()
    return classroom
