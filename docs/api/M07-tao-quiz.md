# M07 — Tạo và biên soạn quiz nháp

Giao diện tại `/documents/{document_id}` có khu vực Quiz nháp: tạo theo tên, số câu, độ khó, chủ đề; danh sách phân trang và chọn bản nháp để biên soạn. Chỉ bật tạo khi trạng thái xử lý là ready; cập nhật theo trạng thái M05. Chỉ sinh viên/giảng viên thấy khu vực này. Hiển thị nhãn AI hỗ trợ tạo, đáp án đúng, giải thích, chủ đề và nguồn; mở đúng trang PDF qua file đã kiểm tra quyền. Sửa câu hỏi giữ nguồn hiện có, lưu từng câu rồi đọc lại API. Có đổi tên, xác nhận xóa và hiển thị lỗi tại thao tác; không có làm bài/chấm điểm/giao lớp.

## 1. POST - /api/v1/documents/{document_id}/quizzes: Sinh viên/giảng viên tạo quiz nháp riêng từ tài liệu ready có quyền đọc

```json
{
  "title": "Ôn tập tài liệu",
  "question_count": 1,
  "difficulty": "medium",
  "topic": "Học tập"
}
```

`title` bắt buộc 1–200 ký tự; `question_count` mặc định 5, số nguyên 1–10; `difficulty`: `easy`, `medium` (mặc định), `hard`; `topic` tùy chọn 1–200 ký tự. Chỉ hỗ trợ một đáp án đúng. Backend dùng `COHERE_API_KEY`, `COHERE_QUIZ_MODEL` (mặc định `command-r7b-12-2024`, độc lập model hỏi đáp), thời gian chờ phản hồi `QUIZ_TIMEOUT_SECONDS` mặc định 180 giây (30–600), timeout kết nối 10 giây; không tự retry. Lấy tối đa `QUIZ_CONTEXT_CHUNKS` đoạn rải đều trong tài liệu (mặc định 12, cấu hình 1–30), không bảo đảm bao phủ toàn tài liệu. Nội dung nguồn/chủ đề gửi tới Cohere. Chỉ lưu khi đủ số câu, cấu trúc và ID nguồn hợp lệ; tên/trang/nội dung nguồn lấy từ database. Quiz luôn là draft, có nhãn AI hỗ trợ tạo; chưa có giao lớp, duyệt hoặc API làm bài.

HTTP **201**:

```json
{
  "id": "99999999-9999-4999-8999-999999999999",
  "document_id": "55555555-5555-4555-8555-555555555555",
  "title": "Ôn tập tài liệu",
  "difficulty": "medium",
  "status": "draft",
  "ai_generated": true,
  "generation_model": "command-r7b-12-2024",
  "created_at": "2026-11-07T08:00:00Z",
  "updated_at": "2026-11-07T08:00:00Z",
  "questions": [
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "position": 0,
      "question": "StudyFlow hỗ trợ việc gì?",
      "choices": [
        "Học tập",
        "Nấu ăn",
        "Lái xe",
        "Du lịch"
      ],
      "correct_index": 0,
      "explanation": "Đoạn nguồn giới thiệu StudyFlow là nền tảng hỗ trợ học tập.",
      "topic": "Học tập",
      "sources": [
        {
          "chunk_id": "66666666-6666-4666-8666-666666666666",
          "document_id": "55555555-5555-4555-8555-555555555555",
          "title": "Giới thiệu StudyFlow",
          "page_number": 1,
          "content": "StudyFlow là nền tảng hỗ trợ học tập theo tài liệu."
        }
      ]
    }
  ]
}
```

## 2. GET - /api/v1/documents/{document_id}/quizzes: Sinh viên/giảng viên liệt kê quiz của chính mình khi còn quyền đọc tài liệu

Không có body. Params: `limit=50&offset=0`, limit 1–100, offset từ 0. Sắp xếp created_at rồi id giảm dần. Không trả câu hỏi/đáp án trong danh sách. HTTP **200**:

```json
[
  {
    "id": "99999999-9999-4999-8999-999999999999",
    "document_id": "55555555-5555-4555-8555-555555555555",
    "title": "Ôn tập tài liệu",
    "difficulty": "medium",
    "status": "draft",
    "ai_generated": true,
    "generation_model": "command-r7b-12-2024",
    "created_at": "2026-11-07T08:00:00Z",
    "updated_at": "2026-11-07T08:00:00Z"
  }
]
```

## 3. GET - /api/v1/quizzes/{quiz_id}: Chủ sở hữu xem quiz nháp và đáp án khi còn quyền đọc tài liệu

Không có body. Đây là API biên soạn, không dùng làm payload cho người làm bài. Response có `Cache-Control: no-store`. HTTP **200**:

```json
{
  "id": "99999999-9999-4999-8999-999999999999",
  "document_id": "55555555-5555-4555-8555-555555555555",
  "title": "Ôn tập tài liệu",
  "difficulty": "medium",
  "status": "draft",
  "ai_generated": true,
  "generation_model": "command-r7b-12-2024",
  "created_at": "2026-11-07T08:00:00Z",
  "updated_at": "2026-11-07T08:00:00Z",
  "questions": [
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "position": 0,
      "question": "StudyFlow hỗ trợ việc gì?",
      "choices": [
        "Học tập",
        "Nấu ăn",
        "Lái xe",
        "Du lịch"
      ],
      "correct_index": 0,
      "explanation": "Đoạn nguồn giới thiệu StudyFlow là nền tảng hỗ trợ học tập.",
      "topic": "Học tập",
      "sources": [
        {
          "chunk_id": "66666666-6666-4666-8666-666666666666",
          "document_id": "55555555-5555-4555-8555-555555555555",
          "title": "Giới thiệu StudyFlow",
          "page_number": 1,
          "content": "StudyFlow là nền tảng hỗ trợ học tập theo tài liệu."
        }
      ]
    }
  ]
}
```

## 4. PATCH - /api/v1/quizzes/{quiz_id}: Chủ sở hữu đổi tên quiz nháp khi còn quyền đọc tài liệu

```json
{
  "title": "Ôn tập lần hai"
}
```

HTTP **200**:

```json
{
  "id": "99999999-9999-4999-8999-999999999999",
  "document_id": "55555555-5555-4555-8555-555555555555",
  "title": "Ôn tập lần hai",
  "difficulty": "medium",
  "status": "draft",
  "ai_generated": true,
  "generation_model": "command-r7b-12-2024",
  "created_at": "2026-11-07T08:00:00Z",
  "updated_at": "2026-11-07T08:05:00Z"
}
```

## 5. PUT - /api/v1/quizzes/{quiz_id}/questions/{question_id}: Chủ sở hữu sửa toàn bộ một câu hỏi nháp khi còn quyền đọc tài liệu

```json
{
  "question": "StudyFlow hỗ trợ việc gì?",
  "choices": [
    "Học tập",
    "Nấu ăn",
    "Lái xe",
    "Du lịch"
  ],
  "correct_index": 0,
  "explanation": "Đoạn nguồn giới thiệu StudyFlow là nền tảng hỗ trợ học tập.",
  "topic": "Học tập",
  "source_ids": [
    "66666666-6666-4666-8666-666666666666"
  ]
}
```

`question`, `explanation`: 1–2.000 ký tự; đúng 4 lựa chọn khác nhau, mỗi lựa chọn 1–500 ký tự; `correct_index`: số nguyên 0–3 (không nhận boolean); `topic`: một chủ đề chính 1–200 ký tự; `source_ids`: 1–5 ID đoạn hiện có trong tài liệu. API kiểm tra cấu trúc và nguồn, chủ sở hữu cần kiểm tra tính đúng của nội dung AI hoặc nội dung tự sửa. HTTP **200**:

```json
{
  "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "position": 0,
  "question": "StudyFlow hỗ trợ việc gì?",
  "choices": [
    "Học tập",
    "Nấu ăn",
    "Lái xe",
    "Du lịch"
  ],
  "correct_index": 0,
  "explanation": "Đoạn nguồn giới thiệu StudyFlow là nền tảng hỗ trợ học tập.",
  "topic": "Học tập",
  "sources": [
    {
      "chunk_id": "66666666-6666-4666-8666-666666666666",
      "document_id": "55555555-5555-4555-8555-555555555555",
      "title": "Giới thiệu StudyFlow",
      "page_number": 1,
      "content": "StudyFlow là nền tảng hỗ trợ học tập theo tài liệu."
    }
  ]
}
```

## 6. DELETE - /api/v1/quizzes/{quiz_id}: Chủ sở hữu xóa quiz nháp cùng câu hỏi khi còn quyền đọc tài liệu

Không có body. HTTP **200**:

```json
{
  "message": "Đã xóa quiz nháp."
}
```

Admin không được dùng API biên soạn; không có quyền vai trò: HTTP **403**.

```json
{
  "detail": "Bạn không có quyền thực hiện thao tác này."
}
```

Quiz không tồn tại hoặc không thuộc người dùng: HTTP **404**.

```json
{
  "detail": "Không tìm thấy quiz."
}
```

Nguồn đã xóa, ngừng công bố, rời lớp hoặc không có quyền đọc: HTTP **404**.

```json
{
  "detail": "Không tìm thấy tài liệu."
}
```

Tạo quiz khi tài liệu chưa ready: HTTP **409**.

```json
{
  "detail": "Tài liệu chưa sẵn sàng để tạo quiz."
}
```

Thiếu căn cứ tạo đủ câu: HTTP **422**.

```json
{
  "detail": "Chưa đủ căn cứ tạo đúng số câu. Hãy giảm số câu hoặc chọn chủ đề khác."
}
```

Sửa nguồn ngoài tài liệu hoặc nguồn đã mất: HTTP **422**.

```json
{
  "detail": "Nguồn không thuộc tài liệu của quiz hoặc không còn tồn tại."
}
```

Phản hồi AI sai cấu trúc, lặp câu hoặc bịa ID nguồn: HTTP **502**. Backend gửi JSON Schema ràng buộc các trường, chỉ số đáp án 0–3 và ID nguồn được phép tới Cohere; vẫn kiểm tra đủ 4 lựa chọn khác nhau, số câu và nguồn trước khi lưu.

```json
{
  "detail": "Dịch vụ tạo quiz trả về câu hỏi hoặc nguồn không hợp lệ."
}
```

Phản hồi AI bị cắt vì hết token: HTTP **502**, không lưu quiz dở dang.

```json
{
  "detail": "Phản hồi tạo quiz bị cắt do giới hạn độ dài. Hãy giảm số câu và thử lại."
}
```

Thiếu key: HTTP **503**.

```json
{
  "detail": "Chưa cấu hình COHERE_API_KEY để tạo quiz."
}
```

Cohere từ chối, gồm hết hạn mức: HTTP **503**.

```json
{
  "detail": "Dịch vụ tạo quiz từ chối yêu cầu. Kiểm tra API key, model và hạn mức Cohere."
}
```

Cohere đã kết nối nhưng không trả phản hồi kịp: HTTP **504**. Lỗi DNS/kết nối tiếp tục trả 503.

```json
{"detail": "Cohere phản hồi quá thời gian chờ khi tạo quiz. Hãy giảm số câu hoặc thử lại sau."}
```
