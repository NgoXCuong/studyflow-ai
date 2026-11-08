# M06 — Hỏi đáp tài liệu

## 1. POST - /api/v1/documents/{document_id}/ask: Hỏi đáp trong một tài liệu ready có quyền đọc theo M04

```json
{
  "question": "Nội dung chính của tài liệu là gì?"
}
```

`question` bỏ khoảng trắng đầu/cuối, bắt buộc 1–2.000 ký tự. Endpoint `/ask` trả lời độc lập, không lưu lịch sử; giao diện dùng các API hội thoại bên dưới. Giao diện hỏi đáp nằm tại `/documents/{document_id}`, nguồn mở đúng trang PDF. Backend dùng embedding câu hỏi theo `EMBEDDING_PROVIDER`, chỉ tìm chunk trong tài liệu được phép đọc và cùng model; lấy tối đa `RAG_TOP_K` đoạn (mặc định 5, cấu hình 1–10). Cohere tạo câu trả lời với `COHERE_API_KEY`, `COHERE_CHAT_MODEL` (mặc định `command-a-03-2025`), timeout `RAG_TIMEOUT_SECONDS` mặc định 60 giây. Nội dung câu hỏi và nguồn được gửi tới dịch vụ AI. Thiếu căn cứ do model đánh giá trên các đoạn tìm được; chưa có ngưỡng điểm tìm kiếm được hiệu chỉnh. ID nguồn phải nằm trong tập đoạn đã gửi, tên/trang/nội dung lấy từ database.

HTTP **200**:

```json
{
  "answer": "Tài liệu giới thiệu các khái niệm cơ sở dữ liệu.",
  "insufficient_evidence": false,
  "sources": [
    {
      "chunk_id": "66666666-6666-4666-8666-666666666666",
      "document_id": "55555555-5555-4555-8555-555555555555",
      "title": "Giáo trình cơ sở dữ liệu",
      "page_number": 1,
      "content": "Các khái niệm cơ sở dữ liệu..."
    }
  ]
}
```

HTTP **200**, thiếu căn cứ hoặc không có đoạn nguồn:

```json
{
  "answer": "Không tìm thấy đủ căn cứ trong tài liệu để trả lời câu hỏi này.",
  "insufficient_evidence": true,
  "sources": []
}
```

HTTP **409**, chưa ready:

```json
{"detail": "Tài liệu chưa sẵn sàng để hỏi đáp."}
```

HTTP **409**, model khác cấu hình hiện tại:

```json
{"detail": "Model embedding của tài liệu khác cấu hình hiện tại. Cần tạo lại embedding trước khi hỏi đáp."}
```

HTTP **404**, không tồn tại, đã xóa hoặc không còn quyền đọc:

```json
{"detail": "Không tìm thấy tài liệu."}
```

HTTP **503**, thiếu key:

```json
{"detail": "Chưa cấu hình COHERE_API_KEY cho dịch vụ trả lời."}
```

HTTP **503**, dịch vụ từ chối (gồm lỗi key, model, hạn mức); lỗi kết nối/embedding trả thông báo an toàn tương ứng:

```json
{"detail": "Dịch vụ trả lời từ chối yêu cầu. Kiểm tra model, API key và hạn mức Cohere."}
```

HTTP **502**, phản hồi lỗi, bị cắt hoặc nguồn ngoài tập truy xuất:

```json
{"detail": "Dịch vụ trả lời trả về kết quả hoặc nguồn không hợp lệ."}
```


## 2. POST - /api/v1/documents/{document_id}/conversations: Tạo hội thoại riêng khi có quyền đọc tài liệu

```json
{"title": "Ôn chương 1"}
```

Tên bỏ khoảng trắng đầu/cuối, 1–200 ký tự. HTTP **201**:

```json
{
  "id": "77777777-7777-4777-8777-777777777777",
  "document_id": "55555555-5555-4555-8555-555555555555",
  "title": "Ôn chương 1",
  "created_at": "2026-11-06T10:00:00Z",
  "updated_at": "2026-11-06T10:00:00Z"
}
```

## 3. GET - /api/v1/documents/{document_id}/conversations: Liệt kê hội thoại của chính mình khi còn quyền đọc tài liệu

Không có body. Params: `limit=50&offset=0`, limit 1–100, offset từ 0. Sắp xếp updated_at rồi id giảm dần. HTTP **200**:

```json
[
  {
    "id": "77777777-7777-4777-8777-777777777777",
    "document_id": "55555555-5555-4555-8555-555555555555",
    "title": "Ôn chương 1",
    "created_at": "2026-11-06T10:00:00Z",
    "updated_at": "2026-11-06T10:00:00Z"
  }
]
```

## 4. POST - /api/v1/conversations/{conversation_id}/turns: Chủ hội thoại gửi câu hỏi khi còn quyền đọc tài liệu ready

```json
{"question": "Giải thích thêm khái niệm đó."}
```

Chỉ lưu cả câu hỏi và kết quả sau khi AI trả lời thành công; lỗi không tạo lượt chat. Dùng tối đa 6 lượt gần nhất, tối đa 4.000 ký tự mỗi câu trả lời cũ, làm ngữ cảnh; câu hỏi cũ tham gia embedding truy xuất và không được coi là bằng chứng. Nguồn vẫn lấy mới từ tài liệu đang có quyền đọc. Các lượt gửi/đổi tên/xóa cùng hội thoại được khóa, không ghi đè nhau. HTTP **201**:

```json
{
  "id": "88888888-8888-4888-8888-888888888888",
  "question": "Giải thích thêm khái niệm đó.",
  "answer": {
    "answer": "Không tìm thấy đủ căn cứ trong tài liệu để trả lời câu hỏi này.",
    "insufficient_evidence": true,
    "sources": []
  },
  "created_at": "2026-11-06T10:01:00Z"
}
```

`answer` cùng cấu trúc API 1, lưu kèm bản chụp nguồn để xem lại. Quyền tài liệu được kiểm tra lại khi đọc lịch sử. HTTP **409**, yêu cầu khác đang xử lý:

```json
{"detail": "Hội thoại đang xử lý yêu cầu khác. Vui lòng thử lại sau."}
```

## 5. GET - /api/v1/conversations/{conversation_id}/turns: Chủ hội thoại đọc lịch sử khi còn quyền đọc tài liệu

Không có body. Response lịch sử có `Cache-Control: no-store`. Params: `limit=50&offset=0`, limit 1–100, offset từ 0. Sắp xếp created_at rồi id giảm dần (mới nhất trước); giao diện đảo từng trang để đọc theo thời gian. HTTP **200**:

```json
[
  {
    "id": "88888888-8888-4888-8888-888888888888",
    "question": "Giải thích thêm khái niệm đó.",
    "answer": {
      "answer": "Không tìm thấy đủ căn cứ trong tài liệu để trả lời câu hỏi này.",
      "insufficient_evidence": true,
      "sources": []
    },
    "created_at": "2026-11-06T10:01:00Z"
  }
]
```

## 6. PATCH - /api/v1/conversations/{conversation_id}: Chủ hội thoại đổi tên khi còn quyền đọc tài liệu

```json
{"title": "Ôn tập khái niệm"}
```

HTTP **200**:

```json
{
  "id": "77777777-7777-4777-8777-777777777777",
  "document_id": "55555555-5555-4555-8555-555555555555",
  "title": "Ôn tập khái niệm",
  "created_at": "2026-11-06T10:00:00Z",
  "updated_at": "2026-11-06T10:02:00Z"
}
```

## 7. DELETE - /api/v1/conversations/{conversation_id}: Chủ hội thoại xóa vĩnh viễn hội thoại và các lượt chat khi còn quyền đọc tài liệu

Không có body. HTTP **200**:

```json
{"message": "Đã xóa hội thoại."}
```

API 4–7 trả HTTP **404** nếu không tồn tại hoặc không phải chủ hội thoại (kể cả giảng viên/admin):

```json
{"detail": "Không tìm thấy hội thoại."}
```

API 2–7 trả HTTP **404** khi quyền tài liệu đã mất, tài liệu bị xóa/ngừng công bố hoặc rời lớp:

```json
{"detail": "Không tìm thấy tài liệu."}
```
