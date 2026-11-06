# M05 — Xử lý tài liệu cho RAG

## 1. GET - /api/v1/documents/{document_id}/processing: Xem trạng thái xử lý tài liệu đang có quyền đọc

Không có body. Áp dụng cùng quyền với API đọc tài liệu M04; sinh viên chỉ xem tài liệu đã công bố trong lớp đang tham gia. Admin không tự có quyền đọc tài liệu của người khác.

Giao diện `/documents/{document_id}` hiển thị trạng thái, lỗi, số lần xử lý và số đoạn khi sẵn sàng. Trang xem PDF và danh sách tài liệu tự cập nhật mỗi 5 giây khi có tài liệu đang chờ/đang xử lý; dừng khi hoàn tất, lỗi hoặc rời trang. Cập nhật trạng thái không tải lại PDF gốc. Lỗi lấy trạng thái có nút tải lại riêng, không tự yêu cầu xử lý lại.

Upload tạo tác vụ bền vững trong PostgreSQL. Backend chọn dịch vụ bằng `EMBEDDING_PROVIDER=cohere` (mặc định) hoặc `gemini`. Cohere dùng `COHERE_API_KEY`, `COHERE_EMBEDDING_MODEL=embed-v5.0-fast` (hoặc `embed-v5.0-pro`); Gemini dùng `GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`. Cả hai trả vector 768 chiều; PDF gốc vẫn ở R2/local. Mặc định chia theo trang tối đa 1.500 ký tự/đoạn, chồng 200 ký tự, tối đa 1.000 đoạn/tài liệu; cấu hình bằng `DOCUMENT_CHUNK_SIZE`, `DOCUMENT_CHUNK_OVERLAP`, `DOCUMENT_MAX_CHUNKS`. Giới hạn được kiểm tra trước khi gọi dịch vụ embedding.

Đặt key trong `.env` tại thư mục gốc dự án (hoặc biến môi trường của process). Sau khi đổi key/provider, khởi động lại backend và worker. Đổi key cùng dịch vụ không cần sửa code. Vector đã tạo bằng model khác phải được tạo lại trước khi dùng chung cho tìm kiếm; tài liệu `ready` không tự xử lý lại khi đổi cấu hình.

Từ thư mục `backend`, chạy `python -m app.services.document_processing` trong process riêng; thêm `--once` để xử lý tối đa một tài liệu rồi thoát. Worker cần được giữ chạy trên máy triển khai. Terminal hiển thị log khởi động, đọc PDF, tiến độ batch, kết quả hoặc mã lỗi; khi hết việc sẽ báo chờ và kiểm tra mỗi 5 giây, không tự thoát nếu không dùng `--once`. `EMBEDDING_BATCH_SIZE` mặc định 32, `EMBEDDING_TIMEOUT_SECONDS` mặc định 30; tác vụ bị gián đoạn được tiếp nhận lại khi lease hết hạn (`PROCESSING_LEASE_SECONDS`, mặc định 300). Không tự retry lỗi dịch vụ embedding trong cùng lần xử lý. Nội dung đoạn được gửi tới dịch vụ đã chọn; API key chỉ nằm ở backend.

Mỗi batch hoàn tất ghi vào `ai_usage_logs`: provider/model, trạng thái, số đoạn/ký tự, thời gian và token nếu provider trả về. Không ghi API key, nội dung PDF hay tự ước tính chi phí. File local/R2 quá giới hạn, mất file, PDF lỗi, vượt số đoạn hoặc lỗi dịch vụ embedding chuyển tác vụ sang `failed`; lỗi được trả về bằng mã và thông báo an toàn.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "document_id": "55555555-5555-4555-8555-555555555555",
  "status": "ready",
  "attempt_count": 1,
  "chunk_count": 12,
  "started_at": "2026-11-05T08:00:00Z",
  "finished_at": "2026-11-05T08:00:10Z",
  "error_code": null,
  "error_message": null
}
```

Chưa được worker nhận: `status=queued`, `attempt_count=0`, `chunk_count=0`, các trường thời gian/lỗi là `null`. Đang xử lý: `status=processing`. Lỗi: `status=failed`, `chunk_count=0`, có `error_code` và `error_message`; ví dụ `cohere_http_429`, `cohere_connection`, `cohere_invalid_response` (hoặc tiền tố `gemini_` khi chọn Gemini), `chunk_limit`, `invalid_pdf`, `empty_pdf`, `storage_error`, `storage_file_missing` (file local mất, cần tải lại), `source_unavailable`.

Tài liệu đã xóa, ngoài quyền hoặc thuộc môn/lớp đã xóa: **404**.

```json
{
  "detail": "Không tìm thấy tài liệu."
}
```

## 2. POST - /api/v1/documents/{document_id}/processing/retry: Chủ sở hữu yêu cầu xử lý lại tài liệu failed trong môn/lớp còn quản lý được

Không có body. Chỉ nhận tài liệu `failed`; yêu cầu hợp lệ đưa về `queued`, xóa lỗi và thời gian lần trước, giữ số lần đã thử. Worker chỉ công bố chunk/vector sau khi xử lý đầy đủ và ghi cùng giao dịch; worker cũ mất claim không được ghi đè kết quả mới. Chạy lại không tạo chunk trùng.

Nút **Thử xử lý lại** trên trang xem PDF chỉ hiện với chủ sở hữu đúng vai trò khi trạng thái `failed`; khóa trong lúc gửi, lỗi API hiển thị tại chỗ. Khi được chấp nhận, giao diện đọc trạng thái mới và tiếp tục theo dõi hàng đợi. Trường hợp mất PDF local hướng dẫn tải lại file từ danh sách tài liệu.

Kết quả Postman mong đợi: **202**.

```json
{
  "document_id": "55555555-5555-4555-8555-555555555555",
  "status": "queued",
  "attempt_count": 1,
  "chunk_count": 0,
  "started_at": null,
  "finished_at": null,
  "error_code": null,
  "error_message": null
}
```

Tài liệu chưa lỗi, đang chờ, đang xử lý hoặc đã sẵn sàng: **409**.

```json
{
  "detail": "Chỉ có thể xử lý lại tài liệu đang ở trạng thái failed."
}
```

Người khác yêu cầu xử lý lại: **403**.

```json
{
  "detail": "Bạn không có quyền quản lý môn học này."
}
```

## 3. GET - /api/v1/documents/{document_id}/chunks: Đọc các đoạn văn bản của tài liệu ready đang có quyền truy cập

Params tùy chọn: `limit=50&offset=0`; `limit` từ 1–100, `offset` từ 0. Sắp xếp theo `position` tăng dần, bắt đầu từ 0. `page_number` bắt đầu từ 1 theo PDF gốc. Không có body. Không trả embedding ra client.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "66666666-6666-4666-8666-666666666666",
    "document_id": "55555555-5555-4555-8555-555555555555",
    "position": 0,
    "page_number": 1,
    "content": "Nội dung văn bản được trích xuất từ trang đầu của tài liệu."
  }
]
```

Tài liệu chưa sẵn sàng: **409**.

```json
{
  "detail": "Tài liệu chưa sẵn sàng để truy xuất nội dung."
}
```

Tài liệu bị xóa, ngừng công bố cho sinh viên, sinh viên rời/bị xóa khỏi lớp hoặc không có quyền đọc: **404**, kể cả URL đã dùng trước đó. Chunk/vector được dọn cùng file theo chính sách xóa M04.

```json
{
  "detail": "Không tìm thấy tài liệu."
}
```
