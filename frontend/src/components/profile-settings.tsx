"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CalendarDays, KeyRound, LockKeyhole, LogOut, Mail, MonitorSmartphone, ShieldCheck, UserRound } from "lucide-react";
import { useUser } from "@/components/study-shell";
import { Feedback, SubmitButton } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
      toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      router.replace("/login");
    } catch (err) { setPasswordError(errorMessage(err)); }
    finally { setChanging(false); }
  }
  const initials = user.full_name.trim().split(/\s+/).slice(-2).map(word => word[0]).join("").toUpperCase();
  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hồ sơ & bảo mật</h1>
      <p className="mt-2 text-sm text-muted-foreground">Quản lý thông tin cá nhân và bảo vệ tài khoản của bạn.</p>
    </header>

    <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="gap-0 border border-primary/15 py-0 shadow-sm ring-0">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-3 border-b pb-5 lg:flex-col lg:items-start">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-semibold text-primary">{initials}</span>
            <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{user.full_name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p><Badge variant="secondary" className="mt-2">{roleLabel[user.role]}</Badge></div>
          </div>
          <dl className="space-y-4 text-sm">
            <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />Ngày tham gia</dt><dd className="mt-1.5 font-medium">{formatDate(user.created_at)}</dd></div>
            <div><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="size-4" />Xác thực email</dt><dd className="mt-1.5 flex items-center gap-1.5 font-medium">{user.email_verified_at ? <><BadgeCheck className="size-4 text-primary" />Đã xác thực</> : "Chưa xác thực"}</dd></div>
          </dl>
        </CardContent>
        <CardFooter className="gap-2 bg-primary/5 px-5 py-3 text-xs"><span className={`size-2 shrink-0 rounded-full ${user.status === "active" ? "bg-primary" : "bg-destructive"}`} />{user.status === "active" ? "Tài khoản đang hoạt động" : "Tài khoản đã khóa"}</CardFooter>
      </Card>

      <div className="min-w-0 space-y-5">
        <Card className="gap-0 border border-primary/15 py-0 shadow-sm ring-0">
          <CardHeader className="border-b bg-primary/5 px-5 py-4">
            <CardTitle><h2 className="flex items-center gap-2 text-base font-semibold"><UserRound className="size-4 text-primary" />Thông tin cá nhân</h2></CardTitle>
            <CardDescription>Tên này được hiển thị trong hồ sơ và lớp học.</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={save} className="space-y-4">
              <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="field"><Label htmlFor="full_name">Họ và tên</Label><Input id="full_name" name="full_name" required maxLength={200} defaultValue={user.full_name} autoComplete="name" placeholder="Nhập họ và tên của bạn" className="h-11" /></div>
                <div className="field"><Label htmlFor="profile-email">Email tài khoản <LockKeyhole className="size-3 text-muted-foreground" aria-hidden="true" /></Label><Input id="profile-email" type="email" value={user.email} readOnly aria-describedby="profile-email-hint" className="h-11 bg-muted/60 text-muted-foreground" /><p id="profile-email-hint" className="text-xs text-muted-foreground">Email không thể thay đổi tại đây.</p></div>
              </fieldset>
              <Feedback error={profileError} message={message} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground">Kiểm tra thông tin trước khi lưu.</p><SubmitButton pending={saving}>Lưu thông tin</SubmitButton></div>
            </form>
          </CardContent>
        </Card>

        <Card className="gap-0 border border-primary/15 py-0 shadow-sm ring-0">
          <CardHeader className="border-b bg-primary/5 px-5 py-4">
            <CardTitle><h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="size-4 text-primary" />Đổi mật khẩu</h2></CardTitle>
            <CardDescription>Sử dụng mật khẩu riêng cho tài khoản StudyFlow.</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <form onSubmit={changePassword} className="space-y-4">
              <fieldset disabled={changing} className="grid min-w-0 gap-4">
                <div className="field"><Label htmlFor="current_password">Mật khẩu hiện tại</Label><PasswordInput id="current_password" name="current_password" required maxLength={128} autoComplete="current-password" placeholder="Nhập mật khẩu đang sử dụng" className="h-11" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="field"><Label htmlFor="new_password">Mật khẩu mới</Label><PasswordInput id="new_password" name="new_password" required minLength={8} maxLength={128} autoComplete="new-password" aria-describedby="password-hint" placeholder="Từ 8 đến 128 ký tự" className="h-11" /></div>
                  <div className="field"><Label htmlFor="confirm_password">Nhập lại mật khẩu mới</Label><PasswordInput id="confirm_password" name="confirm_password" required minLength={8} maxLength={128} autoComplete="new-password" placeholder="Xác nhận mật khẩu mới" className="h-11" /></div>
                </div>
                <p id="password-hint" className="text-xs text-muted-foreground">Mật khẩu mới có từ 8 đến 128 ký tự.</p>
              </fieldset>
              <p className="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-950"><LockKeyhole className="mt-0.5 size-4 shrink-0" />Đổi mật khẩu sẽ kết thúc tất cả phiên đăng nhập. Bạn cần đăng nhập lại bằng mật khẩu mới.</p>
              <Feedback error={passwordError} />
              <div className="flex justify-end border-t pt-4"><SubmitButton pending={changing}>Cập nhật mật khẩu</SubmitButton></div>
            </form>
          </CardContent>
        </Card>

        <Card className="gap-0 border border-primary/15 py-0 shadow-sm ring-0">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 basis-56"><h2 className="flex items-center gap-2 text-base font-semibold"><MonitorSmartphone className="size-4 text-primary" />Phiên đăng nhập</h2><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Kết thúc đăng nhập trên tất cả thiết bị, bao gồm thiết bị này.</p></div>
              <ConfirmAction label="Đăng xuất tất cả" icon={<LogOut />} title="Đăng xuất khỏi tất cả phiên?" description="Bạn sẽ cần đăng nhập lại trên tất cả thiết bị đang sử dụng tài khoản này." action={() => api("/auth/logout-all", { method: "POST" })} onDone={() => router.replace("/login")} variant="outline" />
            </div>
            <p className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />Để đăng xuất riêng thiết bị này, dùng nút Đăng xuất trên thanh điều hướng.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}
