from datetime import datetime, timezone
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader
from pypdf.errors import PyPdfError
from sqlalchemy import and_, event, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.auth import User
from app.models.courses import Classroom, ClassroomMember, Course
from app.models.documents import Document
from app.models.processing import DocumentProcessingJob
from app.services.courses import get_chapter, get_classroom, get_course
from app.services import document_storage


def visible_documents(user: User):
    membership = exists().where(
        ClassroomMember.classroom_id == Document.classroom_id,
        ClassroomMember.student_id == user.id, ClassroomMember.left_at.is_(None),
    )
    personal = and_(Document.classroom_id.is_(None), Course.kind == "personal", Document.owner_id == user.id)
    classroom = and_(
        Document.classroom_id.is_not(None), Course.kind == "teaching", Classroom.deleted_at.is_(None),
        or_(and_(Course.owner_id == user.id, user.role == "teacher"),
            and_(Document.published_at.is_not(None), user.role == "student", membership)),
    )
    return select(Document).join(Course).outerjoin(Classroom, Classroom.id == Document.classroom_id).where(
        Document.deleted_at.is_(None), Course.deleted_at.is_(None), or_(personal, classroom),
    )


def get_document(db: Session, user: User, document_id: UUID, *, write: bool = False) -> Document:
    if not write:
        document = db.scalar(visible_documents(user).where(Document.id == document_id))
    else:
        document = db.scalar(select(Document).where(Document.id == document_id, Document.deleted_at.is_(None)))
        if document is not None:
            get_course(db, user, document.course_id, write=True)
            if document.owner_id != user.id:
                raise HTTPException(403, "Bạn không có quyền quản lý tài liệu này.")
            if document.classroom_id is not None:
                get_classroom(db, user, document.classroom_id, write=True)
            document = db.scalar(select(Document).where(
                Document.id == document_id, Document.deleted_at.is_(None),
            ).with_for_update().execution_options(populate_existing=True))
    if document is None:
        raise HTTPException(404, "Không tìm thấy tài liệu.")
    return document


def validate_pdf(file: UploadFile) -> tuple[bytes, str, int]:
    settings = get_settings()
    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not filename.lower().endswith(".pdf") or file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(415, "Chỉ hỗ trợ file PDF.")
    if len(filename) > 255 or any(ord(char) < 32 for char in filename):
        raise HTTPException(422, "Tên file không hợp lệ hoặc dài quá 255 ký tự.")
    if file.size is not None and file.size > settings.document_max_size_bytes:
        raise HTTPException(413, f"File vượt dung lượng tối đa {settings.document_max_size_bytes / (1024 * 1024):g} MiB.")
    content = file.file.read(settings.document_max_size_bytes + 1)
    if len(content) > settings.document_max_size_bytes:
        raise HTTPException(413, f"File vượt dung lượng tối đa {settings.document_max_size_bytes / (1024 * 1024):g} MiB.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(422, "File rỗng hoặc không phải nội dung PDF hợp lệ.")
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(422, "Chưa hỗ trợ PDF được mã hóa hoặc bảo vệ bằng mật khẩu.")
        page_count = len(reader.pages)
        if page_count > settings.document_max_pages:
            raise HTTPException(413, f"PDF vượt giới hạn {settings.document_max_pages} trang.")
        if page_count == 0:
            raise HTTPException(422, "PDF không có trang nội dung.")
    except (PyPdfError, ValueError, TypeError, KeyError, IndexError, RecursionError) as exc:
        raise HTTPException(422, "Không đọc được nội dung PDF. Vui lòng kiểm tra hoặc xuất lại file.") from exc
    return content, filename, page_count


def upload_document(db: Session, user: User, course_id: UUID, file: UploadFile, title: str,
                    classroom_id: UUID | None, chapter_id: UUID | None) -> Document:
    course = get_course(db, user, course_id, write=True)
    if course.kind == "personal":
        if user.role != "student" or classroom_id is not None:
            raise HTTPException(403, "Chỉ sinh viên sở hữu được tải tài liệu vào môn cá nhân, không gắn lớp.")
    else:
        if classroom_id is None:
            raise HTTPException(422, "Tài liệu môn giảng dạy phải thuộc một lớp học.")
        classroom = get_classroom(db, user, classroom_id, write=True)
        if classroom.course_id != course_id:
            raise HTTPException(404, "Không tìm thấy lớp học trong môn này.")
    if chapter_id is not None:
        get_chapter(db, course_id, chapter_id)
    content, filename, page_count = validate_pdf(file)

    # Serialize quota checks across all courses owned by this user.
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    used_bytes = db.scalar(select(func.coalesce(func.sum(Document.size_bytes), 0)).where(
        Document.owner_id == user.id, Document.storage_deleted_at.is_(None),
    ))
    if used_bytes + len(content) > get_settings().document_user_quota_bytes:
        raise HTTPException(413, "Vượt hạn mức lưu trữ tài liệu. File đã xóa vẫn tính dung lượng đến khi được dọn.")
    key = document_storage.store_file(content)

    # Chỉ dọn file vừa tạo nếu giao dịch metadata thất bại, kể cả khi commit lỗi.
    event.listen(db, "after_rollback", lambda session: document_storage.cleanup_file(key), once=True)
    document = Document(
        course_id=course_id, owner_id=user.id, classroom_id=classroom_id, chapter_id=chapter_id,
        title=title, original_filename=filename, storage_key=key, mime_type="application/pdf",
        size_bytes=len(content), page_count=page_count,
    )
    db.add(document)
    db.flush()
    db.add(DocumentProcessingJob(document_id=document.id))
    db.flush()
    return document


def set_publication(document: Document, published: bool) -> None:
    if document.classroom_id is None:
        raise HTTPException(422, "Chỉ tài liệu lớp học mới có trạng thái công bố.")
    if published and document.published_at is None:
        document.published_at = datetime.now(timezone.utc)
    elif not published:
        document.published_at = None
