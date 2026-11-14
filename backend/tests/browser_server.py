"""Local browser QA: isolated database schema/storage and deterministic AI responses."""
from io import BytesIO
from unittest.mock import patch

import uvicorn
from pydantic import SecretStr
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, RectangleObject
from sqlalchemy.orm import Session

from app.core.config import get_settings

settings = get_settings()
settings.allowed_origins = ["http://localhost:3001"]
settings.embedding_provider = "cohere"
settings.cohere_api_key = SecretStr("browser-qa-test-only")

from app.main import app  # noqa: E402
from app.models.auth import User  # noqa: E402
from app.schemas.quizzes import GeneratedQuiz, QuestionInput  # noqa: E402
from app.services.document_processing import process_once  # noqa: E402
from test_documents import DocumentTests, pdf_bytes  # noqa: E402


def pdf_fixture():
    writer = PdfWriter()
    writer.add_page(PdfReader(BytesIO(pdf_bytes())).pages[0])
    page = writer.pages[0]
    page.mediabox = RectangleObject([0, 0, 600, 800])
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 14 Tf 45 730 Td (StudyFlow supports learning with course documents.) Tj "
                    b"0 -35 Td (A quiz has one correct answer per question.) Tj "
                    b"0 -35 Td (Practice results help plan review sessions.) Tj ET")
    page.replace_contents(stream)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def embeddings(client, texts, title, **kwargs):
    return [[1.] + [0.] * 767 for _ in texts], len(texts) * 8


def answer(client, question, chunks, history=None, usage=None):
    if usage is not None:
        usage["total_tokens"] = 32
    return "StudyFlow hỗ trợ học theo tài liệu môn học. Mỗi câu quiz có một đáp án đúng; kết quả luyện tập giúp lập kế hoạch ôn tập.", [str(chunks[0].id)]


def questions(client, data, chunks, usage=None):
    if usage is not None:
        usage["total_tokens"] = 64
    catalog = [
        ("StudyFlow hỗ trợ hoạt động nào?", ["Học theo tài liệu môn học", "Đặt vé", "Mua hàng", "Chỉnh sửa ảnh"], 0),
        ("Một câu quiz có bao nhiêu đáp án đúng?", ["Không có", "Một", "Hai", "Bốn"], 1),
        ("Dữ liệu nào giúp lập kế hoạch ôn tập?", ["Kết quả luyện tập", "Màu giao diện", "Tên trình duyệt", "Hình nền"], 0),
        ("Nguồn học được đề cập trong tài liệu là gì?", ["Tài liệu môn học", "Quảng cáo", "Tin nhắn lạ", "Lịch sử mua hàng"], 0),
        ("Kết quả luyện tập giúp chuẩn bị hoạt động nào?", ["Ôn tập", "Thanh toán", "Đặt chỗ", "Gửi hàng"], 0),
    ]
    return GeneratedQuiz(questions=[QuestionInput(question=text, choices=choices, correct_index=correct,
        explanation="Đối chiếu nội dung tại trang 1 của tài liệu StudyFlow.", topic=data.topic or "Ôn tập StudyFlow",
        source_ids=[chunks[0].id]) for text, choices, correct in catalog[:data.question_count]])


if __name__ == "__main__":
    DocumentTests.setUpClass()
    fixture = DocumentTests("test_upload_metadata_and_protected_file")
    try:
        fixture.setUp()
        with patch("app.services.document_processing.embed_batch", side_effect=embeddings), \
                patch("app.services.qa.embed_batch", side_effect=embeddings), \
                patch("app.services.qa.generate_answer", side_effect=answer), \
                patch("app.services.quizzes.generate_questions", side_effect=questions):
            with Session(fixture.engine) as db, db.begin():
                for name in ("student", "teacher", "admin"):
                    db.get(User, fixture.ids[name]).full_name = f"QA {name.title()}"
            course = fixture.course("teacher")
            teacher = fixture.client("teacher")
            teacher.patch(f"/api/v1/courses/{course}", json={"title": "QA — StudyFlow"})
            classroom = teacher.post(f"/api/v1/courses/{course}/classrooms", json={"title": "QA — Lớp kiểm thử"}).json()["id"]
            fixture.join(classroom)
            chapter = teacher.post(f"/api/v1/courses/{course}/chapters", json={"title": "StudyFlow căn bản"}).json()["id"]
            teacher.post(f"/api/v1/courses/{course}/topics", json={"title": "Ôn tập StudyFlow", "chapter_id": chapter})
            doc = fixture.upload(course, name="teacher", content=pdf_fixture(), classroom_id=classroom).json()
            assert process_once(fixture.engine)
            teacher.patch(f"/api/v1/documents/{doc['id']}", json={"published": True})
            draft = teacher.post(f"/api/v1/documents/{doc['id']}/quizzes", json={"title": "QA — Quiz StudyFlow", "question_count": 5})
            assert draft.status_code == 201, draft.text
            print(f"QA_READY schema={DocumentTests.schema} document={doc['id']} classroom={classroom} quiz={draft.json()['id']}", flush=True)
            uvicorn.run(app, host="127.0.0.1", port=8001)
    finally:
        fixture.doCleanups()
        DocumentTests.tearDownClass()
