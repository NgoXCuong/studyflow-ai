"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useUser } from "@/components/study-shell";
import { Feedback, SubmitButton } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, formatDate, jsonBody, roleLabel, type User } from "@/lib/api";

export default function ProfilePage() {
  const { user, updateUser } = useUser();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setProfileError(""); setMessage("");
    try {
      const updated = await api<User>("/users/me", { method: "PATCH", body: JSON.stringify({ full_name: String(new FormData(event.currentTarget).get("full_name")).trim() }) });
      updateUser(updated); setMessage("Đã cập nhật họ tên của bạn.");
    } catch (err) { setProfileError(errorMessage(err)); }
    finally { setSaving(false); }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError("");
    const form = new FormData(event.currentTarget);
    if (form.get("new_password") !== form.get("confirm_password")) { setPasswordError("Mật khẩu xác nhận chưa khớp."); return; }
    setChanging(true);
    try {
      await api("/auth/change-password", jsonBody({ current_password: form.get("current_password"), new_password: form.get("new_password") }));
      router.replace("/login");
    } catch (err) { setPasswordError(errorMessage(err)); }
    finally { setChanging(false); }
  }
  return <div className="space-y-5"><div><p className="eyebrow mb-3">Tài khoản của bạn</p><h1 className="page-heading">Hồ sơ & bảo mật</h1><p className="mt-3 text-muted-foreground">Cập nhật thông tin và giữ quyền kiểm soát tài khoản.</p></div>
    <div className="grid items-start gap-6 xl:grid-cols-[300px_1fr]"><Card className="border shadow-none py-0"><CardContent className="p-6"><span className="mb-5 flex size-18 items-center justify-center rounded-2xl bg-accent text-3xl font-semibold text-primary">{user.full_name.slice(0, 1).toUpperCase()}</span><h2 className="text-xl font-semibold break-words">{user.full_name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><Badge variant="secondary" className="mt-4">{roleLabel[user.role]}</Badge><dl className="mt-6 space-y-4 border-t pt-5 text-sm"><div><dt className="text-muted-foreground">Ngày tham gia</dt><dd className="mt-1 font-medium">{formatDate(user.created_at)}</dd></div><div><dt className="text-muted-foreground">Xác thực email</dt><dd className="mt-1 flex items-center gap-1.5 font-medium">{user.email_verified_at ? <><Check className="size-4 text-primary" />Đã xác thực</> : "Chưa xác thực"}</dd></div></dl></CardContent></Card>
      <div className="space-y-6"><Card className="border shadow-none py-0"><CardHeader className="p-6 pb-0"><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="size-5 text-primary" />Thông tin cá nhân</CardTitle><CardDescription>Họ tên giúp giảng viên và thành viên nhận biết bạn.</CardDescription></CardHeader><CardContent className="p-6"><form onSubmit={save} className="grid gap-5"><div className="field"><Label htmlFor="full_name">Họ và tên</Label><Input id="full_name" name="full_name" required maxLength={200} defaultValue={user.full_name} autoComplete="name" className="app-input" /></div><div className="field"><Label htmlFor="profile-email">Email tài khoản</Label><Input id="profile-email" type="email" value={user.email} readOnly className="app-input bg-muted" /><p className="text-xs text-muted-foreground">Email tài khoản không thể thay đổi tại đây.</p></div><Feedback error={profileError} message={message} /><div className="flex justify-end"><SubmitButton pending={saving}>Lưu thông tin</SubmitButton></div></form></CardContent></Card>
      <Card className="border shadow-none py-0"><CardHeader className="p-6 pb-0"><CardTitle className="flex items-center gap-2 text-lg"><LockKeyhole className="size-5 text-primary" />Đổi mật khẩu</CardTitle><CardDescription>Sau khi đổi mật khẩu, tất cả phiên được thu hồi. Bạn cần đăng nhập lại.</CardDescription></CardHeader><CardContent className="p-6"><form onSubmit={changePassword} className="grid gap-5"><div className="field"><Label htmlFor="current_password">Mật khẩu hiện tại</Label><PasswordInput id="current_password" name="current_password" required maxLength={128} autoComplete="current-password" className="app-input" /></div><div className="grid gap-5 sm:grid-cols-2"><div className="field"><Label htmlFor="new_password">Mật khẩu mới</Label><PasswordInput id="new_password" name="new_password" required minLength={8} maxLength={128} autoComplete="new-password" className="app-input" /></div><div className="field"><Label htmlFor="confirm_password">Nhập lại mật khẩu mới</Label><PasswordInput id="confirm_password" name="confirm_password" required minLength={8} maxLength={128} autoComplete="new-password" className="app-input" /></div></div><p className="text-xs text-muted-foreground">Mật khẩu mới có từ 8 đến 128 ký tự.</p><Feedback error={passwordError} /><div className="flex justify-end"><SubmitButton pending={changing}>Đổi mật khẩu</SubmitButton></div></form></CardContent></Card>
      <Card className="border shadow-none py-0"><CardContent className="flex flex-wrap items-center justify-between gap-5 p-6"><div><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" />Phiên đăng nhập</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Đăng xuất khỏi tất cả thiết bị, bao gồm phiên hiện tại.</p></div><ConfirmAction label="Đăng xuất tất cả" icon={<LogOut />} title="Đăng xuất khỏi tất cả phiên?" description="Bạn sẽ cần đăng nhập lại trên tất cả thiết bị đang sử dụng tài khoản này." action={() => api("/auth/logout-all", { method: "POST" })} onDone={() => router.replace("/login")} variant="outline" /></CardContent></Card>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><LogOut className="size-3.5" />Đăng xuất phiên hiện tại từ thanh điều hướng.</p></div>
    </div>
  </div>;
}
