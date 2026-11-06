import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.dependencies import CurrentUser, Database, limit_auth_requests, require_same_origin
from app.core.security import token_hash
from app.models.auth import User
from app.models.courses import Classroom, ClassroomMember, Course
from app.schemas.auth import MessageOutput
from app.schemas.courses import ClassroomOutput, ClassroomUpdate, JoinClassroomInput, JoinCodeOutput, MemberOutput
from app.services.courses import get_classroom

router = APIRouter(prefix="/classrooms", tags=["classrooms"])
mutation = [Depends(require_same_origin)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("", response_model=list[ClassroomOutput])
def list_classrooms(user: CurrentUser, db: Database, course_id: UUID | None = None,
                    limit: Limit = 50, offset: Offset = 0):
    membership = exists().where(
        ClassroomMember.classroom_id == Classroom.id,
        ClassroomMember.student_id == user.id, ClassroomMember.left_at.is_(None),
    )
    query = select(Classroom).join(Course).where(
        Classroom.deleted_at.is_(None), Course.deleted_at.is_(None),
        (Course.owner_id == user.id) | (membership & (user.role == "student")),
    )
    if course_id is not None:
        query = query.where(Classroom.course_id == course_id)
    return db.scalars(query.order_by(Classroom.created_at.desc(), Classroom.id).limit(limit).offset(offset)).all()


@router.post("/join", response_model=ClassroomOutput,
             dependencies=[Depends(require_same_origin), Depends(limit_auth_requests)])
def join_classroom(data: JoinClassroomInput, user: CurrentUser, db: Database):
    if user.role != "student":
        raise HTTPException(403, "Chỉ sinh viên được tham gia lớp bằng mã.")
    code_hash = token_hash(data.join_code)
    classroom = db.scalar(select(Classroom).where(Classroom.join_code_hash == code_hash))
    if classroom is None:
        raise HTTPException(404, "Mã tham gia không hợp lệ hoặc lớp đã ngừng nhận thành viên.")
    course = db.scalar(select(Course).where(
        Course.id == classroom.course_id, Course.deleted_at.is_(None), Course.kind == "teaching",
    ).with_for_update())
    classroom = db.scalar(select(Classroom).where(
        Classroom.id == classroom.id, Classroom.deleted_at.is_(None),
        Classroom.join_code_hash == code_hash, Classroom.join_enabled.is_(True),
    ).with_for_update().execution_options(populate_existing=True))
    if course is None or classroom is None:
        raise HTTPException(404, "Mã tham gia không hợp lệ hoặc lớp đã ngừng nhận thành viên.")
    db.execute(insert(ClassroomMember).values(classroom_id=classroom.id, student_id=user.id)
               .on_conflict_do_update(
                   index_elements=[ClassroomMember.classroom_id, ClassroomMember.student_id],
                   set_={"left_at": None},
               ))
    db.flush()
    return classroom


@router.get("/{classroom_id}", response_model=ClassroomOutput)
def read_classroom(classroom_id: UUID, user: CurrentUser, db: Database):
    return get_classroom(db, user, classroom_id)


@router.patch("/{classroom_id}", response_model=ClassroomOutput, dependencies=mutation)
def update_classroom(classroom_id: UUID, data: ClassroomUpdate, user: CurrentUser, db: Database):
    classroom = get_classroom(db, user, classroom_id, write=True)
    if data.join_enabled and classroom.join_code_hash is None:
        raise HTTPException(409, "Cần tạo mã tham gia trước khi mở lớp.")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(classroom, field, value)
    db.flush()
    return classroom


@router.post("/{classroom_id}/join-code", response_model=JoinCodeOutput, dependencies=mutation)
def rotate_join_code(classroom_id: UUID, user: CurrentUser, db: Database):
    classroom = get_classroom(db, user, classroom_id, write=True)
    code = secrets.token_urlsafe(24)
    classroom.join_code_hash = token_hash(code)
    classroom.join_enabled = True
    db.flush()
    return {"join_code": code}


@router.delete("/{classroom_id}", response_model=MessageOutput, dependencies=mutation)
def delete_classroom(classroom_id: UUID, user: CurrentUser, db: Database):
    classroom = get_classroom(db, user, classroom_id, write=True)
    classroom.deleted_at = func.now()
    classroom.join_enabled = False
    classroom.join_code_hash = None
    return {"message": "Đã xóa lớp học."}


@router.get("/{classroom_id}/members", response_model=list[MemberOutput])
def list_members(classroom_id: UUID, user: CurrentUser, db: Database, include_left: bool = False,
                 limit: Limit = 50, offset: Offset = 0):
    get_classroom(db, user, classroom_id, write=True)
    query = select(
        ClassroomMember.student_id, User.full_name, ClassroomMember.joined_at, ClassroomMember.left_at,
    ).join(User, User.id == ClassroomMember.student_id).where(ClassroomMember.classroom_id == classroom_id)
    if not include_left:
        query = query.where(ClassroomMember.left_at.is_(None))
    return db.execute(query.order_by(ClassroomMember.joined_at, ClassroomMember.student_id)
                      .limit(limit).offset(offset)).mappings().all()


@router.delete("/{classroom_id}/members/me", response_model=MessageOutput, dependencies=mutation)
def leave_classroom(classroom_id: UUID, user: CurrentUser, db: Database):
    classroom = get_classroom(db, user, classroom_id)
    # Cùng khóa môn với tham gia/xóa lớp để không khôi phục quyền do yêu cầu chạy đồng thời.
    db.scalar(select(Course).where(Course.id == classroom.course_id).with_for_update())
    member = db.get(ClassroomMember, (classroom_id, user.id), populate_existing=True)
    if user.role != "student" or member is None or member.left_at is not None:
        raise HTTPException(404, "Bạn không phải thành viên đang tham gia lớp.")
    member.left_at = func.now()
    return {"message": "Đã rời lớp học."}


@router.delete("/{classroom_id}/members/{student_id}", response_model=MessageOutput, dependencies=mutation)
def remove_member(classroom_id: UUID, student_id: UUID, user: CurrentUser, db: Database):
    get_classroom(db, user, classroom_id, write=True)
    member = db.get(ClassroomMember, (classroom_id, student_id))
    if member is None or member.left_at is not None:
        raise HTTPException(404, "Không tìm thấy thành viên đang tham gia lớp.")
    member.left_at = func.now()
    return {"message": "Đã xóa thành viên khỏi lớp."}
