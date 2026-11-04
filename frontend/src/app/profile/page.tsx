"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type User } from "@/lib/api";

const roles = { student: "Sinh viên", teacher: "Giảng viên", admin: "Quản trị viên" };

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let active = true;
    api<User>("/auth/me").then((profile) => {
      if (active) { setUser(profile); setFullName(profile.full_name); }
    }).catch((failure) => {
      if (!active) return;
      if (failure instanceof ApiError && failure.status === 401) router.replace("/login");
      else setError(failure.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) router.replace("/login");
      else setError(failure instanceof Error ? failure.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform(async () => {
      const profile = await api<User>("/users/me", { method: "PATCH", body: JSON.stringify({ full_name: fullName.trim() }) });
      setUser(profile);
      setFullName(profile.full_name);
      setMessage("Đã cập nhật hồ sơ.");
    });
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("new_password") !== form.get("confirm_password")) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    void perform(async () => {
      const result = await api<{ message: string }>("/auth/change-password", {
        method: "POST", body: JSON.stringify({ current_password: form.get("current_password"), new_password: form.get("new_password") }),
      });
      setMessage(result.message);
      setSignedOut(true);
      setUser(null);
    });
  }

  function logout(all = false) {
    void perform(async () => {
      await api(`/auth/${all ? "logout-all" : "logout"}`, { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/profile" className="text-xl font-semibold tracking-tight">StudyFlow AI</Link>
          {!signedOut && <Button variant="outline" disabled={busy} onClick={() => logout()}>Đăng xuất</Button>}
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hồ sơ của bạn</h1>
          <p className="mt-2 text-muted-foreground">Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
        </div>
        {loading && <p role="status">Đang tải hồ sơ…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        {signedOut && <Link href="/login" className="underline underline-offset-4">Đăng nhập lại</Link>}
        {!loading && !user && !signedOut && <Link href="/login" className="underline underline-offset-4">Quay lại đăng nhập</Link>}
        {user && <div className="grid items-start gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Thông tin cá nhân</CardTitle><CardDescription>{roles[user.role]}</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile_email">Email</Label>
                  <Input id="profile_email" type="email" value={user.email} readOnly />
                  <p className="text-xs text-muted-foreground">{user.email_verified_at ? "Email đã xác thực" : "Email chưa xác thực"}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile_name">Họ và tên</Label>
                  <Input id="profile_name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={200} disabled={busy} />
                </div>
                <Button type="submit" disabled={busy}>{busy ? "Đang xử lý…" : "Lưu thay đổi"}</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Bảo mật</CardTitle><CardDescription>Đổi mật khẩu sẽ đăng xuất tất cả phiên hiện có.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={changePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current_password">Mật khẩu hiện tại</Label>
                  <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_password">Mật khẩu mới</Label>
                  <Input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} />
                  <p className="text-xs text-muted-foreground">Từ 8 đến 128 ký tự.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Xác nhận mật khẩu mới</Label>
                  <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required maxLength={128} disabled={busy} />
                </div>
                <Button type="submit" disabled={busy}>Đổi mật khẩu</Button>
              </form>
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">Thu hồi mọi phiên đăng nhập, bao gồm phiên hiện tại.</p>
                <Button variant="outline" disabled={busy} onClick={() => logout(true)}>Đăng xuất tất cả phiên</Button>
              </div>
            </CardContent>
          </Card>
        </div>}
      </main>
    </div>
  );
}
