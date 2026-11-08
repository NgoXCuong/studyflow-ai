# M01 — Xác thực

Các ô mật khẩu tại trang đăng nhập, đăng ký và đặt lại mật khẩu có nút mắt ẩn/hiện; mặc định ẩn, không thay đổi dữ liệu gửi API.

Header trang chủ kiểm tra phiên qua `GET /api/v1/auth/me`, dùng cơ chế refresh hiện có. Khách thấy Đăng nhập/Bắt đầu; người đã đăng nhập thấy liên kết hồ sơ và Vào học (admin: Quản trị). Khi đang kiểm tra hiển thị skeleton, khi lỗi kết nối có nút thử lại; kiểm tra lại khi quay về tab.

## 1. POST - /api/v1/auth/register: Đăng ký tài khoản sinh viên tại `/register`

Body:

```json
{
  "email": "student@example.com",
  "full_name": "Nguyễn Văn A",
  "password": "Example-password-1"
}
```

Kết quả Postman mong đợi: **201** (JSON mẫu).

```json
{
  "message": "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản."
}
```

## 2. POST - /api/v1/auth/verify-email: Xác thực email bằng token trong email tại `/verify-email`

Body:

```json
{
  "token": "{{email_token}}"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Xác thực email thành công. Bạn có thể đăng nhập."
}
```

## 3. POST - /api/v1/auth/resend-verification: Gửi lại email xác thực tại `/resend-verification`

Body:

```json
{
  "email": "student@example.com"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Nếu tài khoản cần xác thực, email hướng dẫn sẽ được gửi."
}
```

## 4. POST - /api/v1/auth/login: Đăng nhập tại `/login`, lưu cookie xác thực và chuyển tới `/courses`

Body:

```json
{
  "email": "student@example.com",
  "password": "Example-password-1"
}
```

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

## 5. GET - /api/v1/auth/me: Xem tài khoản đang đăng nhập

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

## 6. POST - /api/v1/auth/refresh: Làm mới phiên bằng cookie refresh

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã làm mới phiên đăng nhập."
}
```

## 7. POST - /api/v1/auth/logout: Đăng xuất phiên hiện tại

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã đăng xuất."
}
```

## 8. POST - /api/v1/auth/logout-all: Đăng xuất tất cả phiên của tài khoản đang đăng nhập từ `/profile`

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã đăng xuất khỏi tất cả phiên."
}
```

## 9. POST - /api/v1/auth/forgot-password: Gửi email đặt lại mật khẩu tại `/forgot-password`

Body:

```json
{
  "email": "student@example.com"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Nếu tài khoản tồn tại và đang hoạt động, email đặt lại mật khẩu sẽ được gửi."
}
```

## 10. POST - /api/v1/auth/reset-password: Đặt lại mật khẩu bằng token trong email reset tại `/reset-password`

Body:

```json
{
  "token": "{{reset_token}}",
  "password": "New-password-2"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã đặt lại mật khẩu và thu hồi tất cả phiên. Vui lòng đăng nhập lại."
}
```

## 11. POST - /api/v1/auth/change-password: Đổi mật khẩu của tài khoản đang đăng nhập tại `/profile`

Body:

```json
{
  "current_password": "Example-password-1",
  "new_password": "New-password-2"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "message": "Đã đổi mật khẩu và thu hồi tất cả phiên. Vui lòng đăng nhập lại."
}
```
