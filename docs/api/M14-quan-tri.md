# M14 — Quản trị tài khoản

## 1. GET - /api/v1/admin/users: Admin xem và lọc tài khoản tại `/admin/users`

Params (tùy chọn): `q=student&role=student&status=active&limit=10&offset=0`. `q` tìm theo họ tên/email, không phân biệt hoa thường; `role`: `student`, `teacher`, `admin`; `status`: `active`, `locked`; `limit`: 1–100; `offset`: từ 0. Sắp xếp mới nhất trước.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "email": "student@example.com",
    "full_name": "Sinh viên minh họa",
    "role": "student",
    "status": "active",
    "email_verified_at": "2026-11-04T02:00:00Z",
    "created_at": "2026-11-04T01:00:00Z"
  }
]
```

Tài khoản sinh viên/giảng viên gọi API: **403**.

```json
{
  "detail": "Bạn không có quyền thực hiện thao tác này."
}
```

## 2. PATCH - /api/v1/admin/users/{user_id}: Admin khóa/mở tài khoản hoặc cấp/thu vai trò giảng viên

Chỉ cập nhật tài khoản sinh viên/giảng viên, không sửa tài khoản admin. Gửi ít nhất một trường: `role` là `student` hoặc `teacher`; `status` là `active` hoặc `locked`; không nhận `null`.

Khóa hoặc đổi vai trò thu hồi tất cả phiên và ghi nhật ký trong cùng giao dịch. Mở khóa không khôi phục phiên đã thu hồi; người dùng đăng nhập lại. Gửi lại giá trị hiện tại không thu hồi phiên hoặc tạo nhật ký trùng. Không xóa/chuyển môn, lớp hoặc lịch sử của tài khoản khi đổi vai trò.

Body:

```json
{
  "role": "teacher",
  "status": "locked"
}
```

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "email": "student@example.com",
  "full_name": "Sinh viên minh họa",
  "role": "teacher",
  "status": "locked",
  "email_verified_at": "2026-11-04T02:00:00Z",
  "created_at": "2026-11-04T01:00:00Z"
}
```

Sửa tài khoản admin, kể cả tài khoản đang đăng nhập: **403**.

```json
{
  "detail": "API này chỉ quản lý tài khoản sinh viên và giảng viên."
}
```

Tài khoản đích không tồn tại: **404**.

```json
{
  "detail": "Không tìm thấy tài khoản."
}
```

## 3. GET - /api/v1/admin/audit-logs: Admin xem nhật ký thay đổi tài khoản tại `/admin/audit-logs`

Params (tùy chọn): `actor_id=11111111-1111-4111-8111-111111111111&target_user_id=22222222-2222-4222-8222-222222222222&limit=10&offset=0`. `limit`: 1–100; `offset`: từ 0. Sắp xếp mới nhất trước.

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
[
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "actor_id": "11111111-1111-4111-8111-111111111111",
    "action": "user_updated",
    "target_user_id": "22222222-2222-4222-8222-222222222222",
    "old_role": "student",
    "new_role": "teacher",
    "old_status": "active",
    "new_status": "locked",
    "created_at": "2026-11-04T03:00:00Z"
  }
]
```

Tài khoản sinh viên/giảng viên gọi API: **403**.

```json
{
  "detail": "Bạn không có quyền thực hiện thao tác này."
}
```
