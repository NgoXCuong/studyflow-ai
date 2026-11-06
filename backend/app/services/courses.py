from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.courses import Chapter, Classroom, ClassroomMember, Course, Topic


def course_access(user: User):
    membership = exists().where(
        Classroom.course_id == Course.id,
        Classroom.deleted_at.is_(None),
        ClassroomMember.classroom_id == Classroom.id,
        ClassroomMember.student_id == user.id,
        ClassroomMember.left_at.is_(None),
    )
    return (Course.owner_id == user.id) | (
        (Course.kind == "teaching") & membership & (user.role == "student")
    )


def get_course(db: Session, user: User, course_id: UUID, *, write: bool = False) -> Course:
    query = select(Course).where(Course.id == course_id, Course.deleted_at.is_(None))
    if write:
        query = query.with_for_update()
    else:
        query = query.where(course_access(user))
    course = db.scalar(query)
    if course is None:
        raise HTTPException(404, "Không tìm thấy môn học.")
    if write:
        if course.owner_id != user.id or (
            course.kind == "teaching" and user.role != "teacher"
        ):
            raise HTTPException(403, "Bạn không có quyền quản lý môn học này.")
    return course


def get_chapter(db: Session, course_id: UUID, chapter_id: UUID) -> Chapter:
    chapter = db.scalar(select(Chapter).where(Chapter.id == chapter_id, Chapter.course_id == course_id))
    if chapter is None:
        raise HTTPException(404, "Không tìm thấy chương trong môn học.")
    return chapter


def get_topic(db: Session, course_id: UUID, topic_id: UUID) -> Topic:
    topic = db.scalar(select(Topic).where(Topic.id == topic_id, Topic.course_id == course_id))
    if topic is None:
        raise HTTPException(404, "Không tìm thấy chủ đề trong môn học.")
    return topic


def get_classroom(db: Session, user: User, classroom_id: UUID, *, write: bool = False) -> Classroom:
    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id, Classroom.deleted_at.is_(None)))
    if classroom is None:
        raise HTTPException(404, "Không tìm thấy lớp học.")
    course = get_course(db, user, classroom.course_id, write=write)
    if write:
        # Khóa môn trước lớp để đồng bộ với thao tác xóa môn và tham gia lớp.
        classroom = db.scalar(select(Classroom).where(
            Classroom.id == classroom_id, Classroom.deleted_at.is_(None),
        ).with_for_update().execution_options(populate_existing=True))
        if classroom is None:
            raise HTTPException(404, "Không tìm thấy lớp học.")
    elif course.owner_id != user.id:
        membership = db.get(ClassroomMember, (classroom_id, user.id))
        if user.role != "student" or membership is None or membership.left_at is not None:
            raise HTTPException(404, "Không tìm thấy lớp học.")
    return classroom
