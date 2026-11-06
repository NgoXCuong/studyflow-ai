# M04 — Quản lý tài liệu PDF

## 1. POST - /api/v1/courses/{course_id}/documents: Chủ sở hữu tải PDF từ mục tài liệu trong môn/lớp phụ trách

Sinh viên tải vào môn cá nhân, không gửi `classroom_id`. Giảng viên tải vào môn giảng dạy và phải gửi `classroom_id` thuộc môn. `chapter_id` tùy chọn, phải thuộc cùng môn. Tài liệu lớp mới tải chưa được công bố.

`title` là tên hiển thị, độc lập với `original_filename`. Form upload tự điền tên từ file PDF và cập nhật khi chọn file khác, kể cả sau lần tải bị từ chối; nếu người dùng đã sửa tên thủ công thì giữ tên đó. Mở lại form sẽ đặt lại thông tin upload.

Body: Postman **form-data**, `file` chọn kiểu **File**, các trường còn lại kiểu **Text**; bỏ trường tùy chọn không dùng. JSON dưới đây mô tả các trường form, không gửi bằng raw JSON.

```json
{
  "file": "[chọn file giao-trinh.pdf]",
  "title": "Giáo trình cơ sở dữ liệu",
  "classroom_id": "33333333-3333-4333-8333-333333333333",
  "chapter_id": "44444444-4444-4444-8444-444444444444"
}
```

Mặc định tối đa **20 MiB, 500 trang**, cấu hình bằng `DOCUMENT_MAX_SIZE_BYTES`, `DOCUMENT_MAX_PAGES`. Chỉ nhận PDF có văn bản trích xuất được; chưa nhận PDF mã hóa/mật khẩu hoặc scan cần OCR. `DOCUMENT_USER_QUOTA_BYTES` mặc định **1 GiB/người**, tính cả file đã xóa mềm cho đến khi dọn thành công; kiểm tra hạn mức được tuần tự hóa giữa các lần upload cùng người dùng.

`DOCUMENT_STORAGE_BACKEND=local` lưu file riêng tư tại `DOCUMENT_STORAGE_DIR`, mặc định `backend/storage/documents`; đường dẫn tương đối tính từ thư mục backend. Với `DOCUMENT_STORAGE_BACKEND=r2`, cấu hình `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` trong môi trường backend, dùng bucket riêng tư với quyền đọc/ghi/xóa object. PDF mới lưu trên R2, metadata vẫn ở PostgreSQL; PDF local cũ vẫn đọc được, không tự di chuyển. Không thay bucket khi còn tài liệu trỏ vào bucket đó. Lưu metadata thất bại sẽ thử dọn file vừa tạo; lỗi dọn được ghi log để đối soát.

Kết quả Postman mong đợi: **201** (JSON mẫu). Trạng thái `queued` kèm tác vụ M05 trong PostgreSQL; worker M05 xử lý riêng, API upload không đánh dấu đã sẵn sàng cho RAG. Theo dõi và thử lại qua API M05.

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "classroom_id": "33333333-3333-4333-8333-333333333333",
  "chapter_id": "44444444-4444-4444-8444-444444444444",
  "title": "Giáo trình cơ sở dữ liệu",
  "original_filename": "giao-trinh.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 102400,
  "page_count": 12,
  "status": "queued",
  "published_at": null,
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

Không phải định dạng được hỗ trợ: **415**.

```json
{
  "detail": "Chỉ hỗ trợ file PDF có văn bản."
}
```

Vượt dung lượng file mặc định: **413**.

```json
{
  "detail": "File vượt dung lượng tối đa 20 MiB."
}
```

Không trích xuất được văn bản: **422**.

```json
{
  "detail": "PDF không trích xuất được văn bản; chưa hỗ trợ file scan cần OCR."
}
```

Vượt hạn mức tổng: **413**.

```json
{
  "detail": "Vượt hạn mức lưu trữ tài liệu. File đã xóa vẫn tính dung lượng đến khi được dọn."
}
```

R2 chưa được cấu hình đầy đủ: **503**.

```json
{
  "detail": "Chưa cấu hình đầy đủ kho lưu trữ R2."
}
```

## 2. GET - /api/v1/courses/{course_id}/documents: Xem tài liệu cá nhân sở hữu hoặc tài liệu lớp được phép đọc

Params (tùy chọn): `classroom_id=33333333-3333-4333-8333-333333333333&chapter_id=44444444-4444-4444-8444-444444444444&q=giao-trinh&limit=10&offset=0`. `q` tìm tiêu đề/tên file gốc, không phân biệt hoa thường; `limit`: 1–100; `offset`: từ 0. Sắp xếp mới nhất trước.

Sinh viên chỉ thấy tài liệu đã công bố trong đúng lớp đang tham gia; giảng viên phụ trách xem cả tài liệu lớp chưa công bố. Tài liệu đã xóa, thuộc môn/lớp đã xóa hoặc ngoài quyền không xuất hiện. Admin không có quyền đọc tài liệu cá nhân/lớp chỉ nhờ vai trò admin.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "55555555-5555-4555-8555-555555555555",
    "course_id": "22222222-2222-4222-8222-222222222222",
    "owner_id": "11111111-1111-4111-8111-111111111111",
    "classroom_id": "33333333-3333-4333-8333-333333333333",
    "chapter_id": "44444444-4444-4444-8444-444444444444",
    "title": "Giáo trình cơ sở dữ liệu",
    "original_filename": "giao-trinh.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 102400,
    "page_count": 12,
    "status": "queued",
    "published_at": "2026-11-04T04:00:00Z",
    "created_at": "2026-11-04T03:00:00Z",
    "updated_at": "2026-11-04T04:00:00Z"
  }
]
```

## 3. GET - /api/v1/documents/{document_id}: Xem metadata tài liệu có quyền truy cập tại `/documents/{document_id}`

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "classroom_id": "33333333-3333-4333-8333-333333333333",
  "chapter_id": "44444444-4444-4444-8444-444444444444",
  "title": "Giáo trình cơ sở dữ liệu",
  "original_filename": "giao-trinh.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 102400,
  "page_count": 12,
  "status": "queued",
  "published_at": "2026-11-04T04:00:00Z",
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T04:00:00Z"
}
```

Tài liệu đã xóa hoặc không có quyền đọc: **404**.

```json
{
  "detail": "Không tìm thấy tài liệu."
}
```

## 4. GET - /api/v1/documents/{document_id}/file: Mở PDF sau khi kiểm tra lại quyền tài liệu

Không có body. Có thể gửi header `Range: bytes=0-4` để lấy một phần file.

Kết quả Postman mong đợi: **200**, `Content-Type: application/pdf`, `Content-Disposition: inline`, `Cache-Control: no-store`; body là nội dung nhị phân PDF, không phải JSON. Với Range hợp lệ: **206**, trả phần byte được yêu cầu. File R2 được truyền theo từng phần qua backend, không tải toàn bộ vào RAM/ổ đĩa và không trả URL bucket cho client; không cần CORS trên bucket. R2 hỗ trợ một khoảng byte mỗi yêu cầu; nhiều khoảng hoặc ngoài phạm vi trả **416**.

Tài liệu đã xóa, ngừng công bố hoặc sinh viên đã rời/bị xóa khỏi lớp: **404**, kể cả khi dùng lại URL cũ.

```json
{
  "detail": "Không tìm thấy tài liệu."
}
```

Metadata còn nhưng file gốc không còn trong kho local/R2: **404**.

```json
{
  "detail": "File tài liệu không còn trong kho lưu trữ."
}
```

Kho R2 không truy cập được: **503**.

```json
{
  "detail": "Chưa đọc được file tài liệu. Vui lòng thử lại sau."
}
```

## 5. PATCH - /api/v1/documents/{document_id}: Chủ sở hữu sửa tên/gắn chương; giảng viên phụ trách công bố hoặc ngừng công bố tài liệu lớp

Gửi ít nhất một trường. `chapter_id: null` bỏ liên kết chương; không cho chuyển môn/lớp, thay file, đổi chủ sở hữu hoặc đặt trạng thái xử lý từ client. Chỉ tài liệu lớp có trường cập nhật `published`.

Body:

```json
{
  "title": "Giáo trình cơ sở dữ liệu - bản học tập",
  "chapter_id": null,
  "published": true
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "classroom_id": "33333333-3333-4333-8333-333333333333",
  "chapter_id": null,
  "title": "Giáo trình cơ sở dữ liệu - bản học tập",
  "original_filename": "giao-trinh.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 102400,
  "page_count": 12,
  "status": "queued",
  "published_at": "2026-11-04T04:00:00Z",
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T04:00:00Z"
}
```

## 6. DELETE - /api/v1/documents/{document_id}: Chủ sở hữu xóa mềm tài liệu, giữ file gốc riêng tư

Không có body. Sau khi xóa, tài liệu không còn trong danh sách và các API metadata/file trả 404. File được giữ theo `DOCUMENT_RETENTION_DAYS` (mặc định 7 ngày). Từ thư mục `backend`, chạy `python -m app.services.document_cleanup` để xem số file đủ điều kiện; thêm `--apply` để xóa file, `--limit 100` giới hạn mỗi lượt. Lệnh tính cả tài liệu thuộc môn/lớp đã xóa đủ thời gian, ghi nhận `storage_deleted_at` sau khi xóa thành công và thử lại file lỗi ở lần chạy sau. Chưa tự lên lịch; cần chạy định kỳ trên máy triển khai. Chạy `alembic upgrade head` trước khi dùng phiên bản này.

Kết quả Postman mong đợi: **200**.

```json
{
  "message": "Đã xóa tài liệu."
}
```
