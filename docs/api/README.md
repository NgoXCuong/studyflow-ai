# API

- [M01 — Xác thực](M01-xac-thuc.md)
- [M02 — Hồ sơ người dùng](M02-ho-so-nguoi-dung.md)
- [M03 — Môn học và lớp học](M03-mon-hoc-lop-hoc.md)
- [M04 — Tài liệu PDF](M04-tai-lieu.md)
- [M05 — Xử lý tài liệu cho RAG](M05-xu-ly-tai-lieu.md)
- [M14 — Quản trị tài khoản](M14-quan-tri.md)

Giao diện M01: `/login`, `/register`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`; liên kết email điền mã từ fragment `#token=...`, xác nhận bằng nút gửi trên trang.

Giao diện M02: `/profile` (hồ sơ, đổi mật khẩu, đăng xuất tất cả phiên). Giao diện M03: `/courses` (danh sách môn), `/courses/{course_id}` (chương/chủ đề và lớp thuộc môn), `/classrooms` (danh sách lớp, sinh viên tham gia bằng mã), `/classrooms/{classroom_id}` (đổi tên, mã tham gia, đóng/mở lớp, thành viên theo quyền và rời/xóa lớp). Điều hướng qua sidebar trên desktop hoặc menu trên mobile.

Giao diện M04: tab **Tài liệu** tại `/courses/{course_id}?tab=documents`, mục **Tài liệu PDF** tại `/classrooms/{classroom_id}`, xem file tại `/documents/{document_id}`. Upload/sửa/công bố/xóa theo quyền sở hữu. M05: tự cập nhật trạng thái xử lý; trang xem PDF hiển thị lỗi, số đoạn và nút thử xử lý lại cho chủ sở hữu khi thất bại. M14: `/admin/users` (lọc tài khoản, xác nhận đổi quyền/khóa/mở), `/admin/audit-logs` (lọc nhật ký theo người thực hiện/tài khoản bị tác động), chỉ dành cho admin.

Frontend dùng `NEXT_PUBLIC_API_URL` là URL backend không kèm `/api/v1` (mặc định `http://localhost:8000`), gọi API với cookie và tự thử làm mới phiên một lần khi nhận 401. Mã tham gia lớp chỉ hiện sau khi tạo/đổi, không lưu vào trình duyệt. Sau đổi mật khẩu hoặc đăng xuất tất cả phiên, chuyển về `/login`.

URL local: `http://localhost:8000`. POST/PATCH/DELETE gửi header `Origin: http://localhost:3000`; body chọn **raw → JSON**. API cần đăng nhập dùng cookie Postman lưu sau khi login. Thay `{...}` trong URL và các biến `{{...}}` bằng ID/token thật từ response hoặc email. Các JSON response dưới đây là mẫu.

Upload PDF M04 dùng **form-data**, để Postman tự tạo header `Content-Type` kèm boundary; các API JSON giữ cách gửi trên. File gốc chỉ mở qua API có cookie xác thực, không có URL thư mục lưu trữ công khai.

## 1. GET - /api/v1/health: Kiểm tra backend có phản hồi

Không có body.

Kết quả Postman mong đợi: **200** (JSON mẫu).

```json
{
  "status": "ok"
}
```
