"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type User } from "@/lib/api";

type Mode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";
const content: Record<Mode, { title: string; description: string; button: string }> = {
  login: { title: "Chào mừng trở lại", description: "Đăng nhập để tiếp tục hành trình học tập của bạn.", button: "Đăng nhập" },
  register: { title: "Tạo tài khoản", description: "Bắt đầu với tài khoản sinh viên StudyFlow AI.", button: "Đăng ký" },
  "forgot-password": { title: "Quên mật khẩu?", description: "Nhập email để nhận liên kết đặt lại mật khẩu.", button: "Gửi liên kết" },
  "reset-password": { title: "Đặt lại mật khẩu", description: "Đặt mật khẩu mới cho tài khoản của bạn.", button: "Lưu mật khẩu mới" },
  "verify-email": { title: "Xác thực email", description: "Xác thực địa chỉ email trước khi đăng nhập.", button: "Xác thực email" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const initialToken = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const copy = content[mode];

  useEffect(() => {
    initialToken.current ??= new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const value = initialToken.current;
    if (value) window.history.replaceState(null, "", window.location.pathname);
    Promise.resolve().then(() => { setToken(value); setReady(true); });
  }, []);

  const resend = mode === "verify-email" && !token;
  const needsEmail = mode === "login" || mode === "register" || mode === "forgot-password" || resend;
  const needsPassword = mode === "login" || mode === "register" || mode === "reset-password";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if ((mode === "register" || mode === "reset-password") && password !== form.get("confirm_password")) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    const body: Record<string, string> = {};
    if (needsEmail) body.email = String(form.get("email") ?? "").trim();
    if (needsPassword) body.password = password;
    if (mode === "register") body.full_name = String(form.get("full_name") ?? "").trim();
    if ((mode === "verify-email" && !resend) || mode === "reset-password") body.token = token;
    setBusy(true);
    try {
      const result = await api<User | { message: string }>(`/auth/${resend ? "resend-verification" : mode}`, {
        method: "POST", body: JSON.stringify(body),
      }, false);
      if (mode === "login") {
        router.replace("/profile");
        router.refresh();
      } else if ("message" in result) {
        setMessage(result.message);
        setDone(true);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" className="block text-center text-xl font-semibold tracking-tight">StudyFlow AI</Link>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{copy.title}</CardTitle>
            <CardDescription>{resend ? "Nhập email để nhận lại liên kết xác thực." : copy.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
              {!ready ? <p role="status">Đang chuẩn bị…</p> : done ? null : <>
                {mode === "register" && <div className="space-y-2">
                  <Label htmlFor="full_name">Họ và tên</Label>
                  <Input id="full_name" name="full_name" autoComplete="name" required maxLength={200} disabled={busy} />
                </div>}
                {needsEmail && <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} />
                </div>}
                {needsPassword && <div className="space-y-2">
                  <Label htmlFor="password">{mode === "reset-password" ? "Mật khẩu mới" : "Mật khẩu"}</Label>
                  <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required minLength={mode === "login" ? 1 : 8} maxLength={128} disabled={busy} />
                  {mode !== "login" && <p className="text-xs text-muted-foreground">Từ 8 đến 128 ký tự.</p>}
                </div>}
                {(mode === "register" || mode === "reset-password") && <div className="space-y-2">
                  <Label htmlFor="confirm_password">Xác nhận mật khẩu</Label>
                  <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required maxLength={128} disabled={busy} />
                </div>}
                {mode === "reset-password" && !token && <p role="alert" className="text-destructive">Thiếu liên kết đặt lại mật khẩu. Hãy yêu cầu email mới.</p>}
                <Button type="submit" className="w-full" disabled={busy || (mode === "reset-password" && !token)}>
                  {busy ? "Đang xử lý…" : resend ? "Gửi lại email xác thực" : copy.button}
                </Button>
              </>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {message && <p role="status" className="text-sm">{message}</p>}
            </form>
            <nav aria-label="Liên kết tài khoản" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {mode !== "login" && <Link className="underline underline-offset-4" href="/login">Đăng nhập</Link>}
              {mode === "login" && <>
                <Link className="underline underline-offset-4" href="/register">Tạo tài khoản</Link>
                <Link className="underline underline-offset-4" href="/forgot-password">Quên mật khẩu?</Link>
              </>}
              {(mode === "login" || mode === "register") && <Link className="underline underline-offset-4" href="/verify-email">Gửi lại email xác thực</Link>}
              {mode === "reset-password" && <Link className="underline underline-offset-4" href="/forgot-password">Yêu cầu liên kết mới</Link>}
            </nav>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
