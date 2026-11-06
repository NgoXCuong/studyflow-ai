# M03 — Môn học, chương, chủ đề và lớp học

## 1. POST - /api/v1/courses: Tạo môn tại `/courses` (sinh viên tạo `personal`, giảng viên tạo `teaching`)

Body:

```json
{
  "title": "Cơ sở dữ liệu",
  "kind": "teaching",
  "description": "Môn học học kỳ 1"
}
```

Kết quả Postman mong đợi: **201** (JSON mẫu).

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "kind": "teaching",
  "title": "Cơ sở dữ liệu",
  "description": "Môn học học kỳ 1",
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 2. GET - /api/v1/courses: Lấy môn sở hữu hoặc đang tham gia qua lớp

Params (tùy chọn): `limit=10&offset=0`.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "owner_id": "11111111-1111-4111-8111-111111111111",
    "kind": "teaching",
    "title": "Cơ sở dữ liệu",
    "description": "Môn học học kỳ 1",
    "created_at": "2026-11-04T03:00:00Z",
    "updated_at": "2026-11-04T03:00:00Z"
  }
]
```

## 3. GET - /api/v1/courses/{course_id}: Xem môn được phép truy cập tại `/courses/{course_id}`, quản lý chương/chủ đề theo quyền sở hữu

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "kind": "teaching",
  "title": "Cơ sở dữ liệu",
  "description": "Môn học học kỳ 1",
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 4. PATCH - /api/v1/courses/{course_id}: Chủ sở hữu sửa môn học

Body:

```json
{
  "title": "Cơ sở dữ liệu nâng cao"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "owner_id": "11111111-1111-4111-8111-111111111111",
  "kind": "teaching",
  "title": "Cơ sở dữ liệu nâng cao",
  "description": "Môn học học kỳ 1",
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 5. DELETE - /api/v1/courses/{course_id}: Chủ sở hữu xóa mềm môn học

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã xóa môn học."
}
```

## 6. POST - /api/v1/courses/{course_id}/chapters: Chủ sở hữu thêm chương

Body:

```json
{
  "title": "Chương 1",
  "position": 0
}
```

Kết quả Postman mong đợi: **201** (JSON mẫu).

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Chương 1",
  "position": 0
}
```

## 7. GET - /api/v1/courses/{course_id}/chapters: Lấy danh sách chương trong môn

Params (tùy chọn): `limit=10&offset=0`.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "course_id": "22222222-2222-4222-8222-222222222222",
    "title": "Chương 1",
    "position": 0
  }
]
```

## 8. PATCH - /api/v1/courses/{course_id}/chapters/{chapter_id}: Chủ sở hữu sửa chương

Body:

```json
{
  "title": "Chương 1: Tổng quan",
  "position": 1
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Chương 1: Tổng quan",
  "position": 1
}
```

## 9. DELETE - /api/v1/courses/{course_id}/chapters/{chapter_id}: Chủ sở hữu xóa chương không còn chủ đề hoặc tài liệu tham chiếu

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã xóa chương."
}
```

Chương được tài liệu tham chiếu, kể cả tài liệu đã xóa mềm: **409**.

```json
{
  "detail": "Chương còn được tài liệu tham chiếu, kể cả tài liệu đã xóa mềm."
}
```

## 10. POST - /api/v1/courses/{course_id}/topics: Chủ sở hữu tạo chủ đề

Body:

```json
{
  "title": "Khóa chính",
  "chapter_id": "33333333-3333-4333-8333-333333333333",
  "description": "Khái niệm khóa chính"
}
```

Kết quả Postman mong đợi: **201** (JSON mẫu).

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "chapter_id": "33333333-3333-4333-8333-333333333333",
  "title": "Khóa chính",
  "description": "Khái niệm khóa chính"
}
```

## 11. GET - /api/v1/courses/{course_id}/topics: Lấy danh sách chủ đề trong môn

Params (tùy chọn): `chapter_id=33333333-3333-4333-8333-333333333333&limit=10&offset=0`.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "44444444-4444-4444-8444-444444444444",
    "course_id": "22222222-2222-4222-8222-222222222222",
    "chapter_id": "33333333-3333-4333-8333-333333333333",
    "title": "Khóa chính",
    "description": "Khái niệm khóa chính"
  }
]
```

## 12. PATCH - /api/v1/courses/{course_id}/topics/{topic_id}: Chủ sở hữu sửa chủ đề

Body:

```json
{
  "title": "Khóa chính và khóa ngoại",
  "chapter_id": null
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "chapter_id": null,
  "title": "Khóa chính và khóa ngoại",
  "description": "Khái niệm khóa chính"
}
```

## 13. DELETE - /api/v1/courses/{course_id}/topics/{topic_id}: Chủ sở hữu xóa chủ đề

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã xóa chủ đề."
}
```

## 14. POST - /api/v1/courses/{course_id}/classrooms: Giảng viên tạo lớp trong môn giảng dạy phụ trách

Body:

```json
{
  "title": "Lớp CSDL 01"
}
```

Kết quả Postman mong đợi: **201** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Lớp CSDL 01",
  "join_enabled": false,
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 15. GET - /api/v1/classrooms: Lấy lớp phụ trách hoặc đang tham gia

Params (tùy chọn): `course_id=22222222-2222-4222-8222-222222222222&limit=10&offset=0`.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "55555555-5555-4555-8555-555555555555",
    "course_id": "22222222-2222-4222-8222-222222222222",
    "title": "Lớp CSDL 01",
    "join_enabled": false,
    "created_at": "2026-11-04T03:00:00Z",
    "updated_at": "2026-11-04T03:00:00Z"
  }
]
```

## 16. GET - /api/v1/classrooms/{classroom_id}: Xem lớp phụ trách hoặc đang tham gia tại `/classrooms/{classroom_id}`

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Lớp CSDL 01",
  "join_enabled": false,
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 17. PATCH - /api/v1/classrooms/{classroom_id}: Giảng viên sửa tên hoặc đóng/mở tham gia lớp

Body:

```json
{
  "title": "Lớp CSDL 02",
  "join_enabled": false
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Lớp CSDL 02",
  "join_enabled": false,
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 18. POST - /api/v1/classrooms/{classroom_id}/join-code: Giảng viên tạo/đổi mã và mở tham gia lớp

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "join_code": "example-join-code-not-a-real-token"
}
```

## 19. POST - /api/v1/classrooms/join: Sinh viên tham gia lớp bằng mã hợp lệ tại `/classrooms`

Body:

```json
{
  "join_code": "{{join_code}}"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "55555555-5555-4555-8555-555555555555",
  "course_id": "22222222-2222-4222-8222-222222222222",
  "title": "Lớp CSDL 01",
  "join_enabled": true,
  "created_at": "2026-11-04T03:00:00Z",
  "updated_at": "2026-11-04T03:00:00Z"
}
```

## 20. GET - /api/v1/classrooms/{classroom_id}/members: Giảng viên xem thành viên đang tham gia lớp

Params (tùy chọn): `include_left=false&limit=10&offset=0`.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "student_id": "66666666-6666-4666-8666-666666666666",
    "full_name": "Nguyễn Văn A",
    "joined_at": "2026-11-04T04:00:00Z",
    "left_at": null
  }
]
```

## 21. DELETE - /api/v1/classrooms/{classroom_id}/members/me: Sinh viên đang tham gia tự rời lớp

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã rời lớp học."
}
```

## 22. DELETE - /api/v1/classrooms/{classroom_id}/members/{student_id}: Giảng viên xóa một thành viên đang tham gia

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã xóa thành viên khỏi lớp."
}
```

## 23. DELETE - /api/v1/classrooms/{classroom_id}: Giảng viên xóa mềm lớp học

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã xóa lớp học."
}
```
