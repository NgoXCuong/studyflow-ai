# M02 — Hồ sơ người dùng

Các ô mật khẩu trong biểu mẫu đổi mật khẩu có nút mắt ẩn/hiện độc lập; mặc định ẩn.

## 1. GET - /api/v1/auth/me: Xem hồ sơ tài khoản đang đăng nhập tại `/profile` và xác định quyền điều hướng

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "student@example.com",
  "full_name": "Nguyễn Văn A",
  "role": "student",
  "status": "active",
  "email_verified_at": "2026-11-04T02:00:00Z",
  "created_at": "2026-11-04T01:00:00Z"
}
```

## 2. PATCH - /api/v1/users/me: Sửa họ tên tài khoản đang đăng nhập tại `/profile`

Body:

```json
{
  "full_name": "Nguyễn Văn B"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "email": "student@example.com",
  "full_name": "Nguyễn Văn B",
  "role": "student",
  "status": "active",
  "email_verified_at": "2026-11-04T02:00:00Z",
  "created_at": "2026-11-04T01:00:00Z"
}
```
