"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Mail, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { Feedback, SubmitButton } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, jsonBody, type User } from "@/lib/api";

const modes = {
  login: { title: "Chào mừng bạn trở lại", description: "Đăng nhập để tiếp tục không gian học tập của bạn.", button: "Đăng nhập" },
  register: { title: "Bắt đầu hành trình học tập", description: "Tạo tài khoản sinh viên và sắp xếp việc học theo cách của bạn.", button: "Tạo tài khoản" },
  "forgot-password": { title: "Quên mật khẩu?", description: "Nhập email tài khoản. Chúng mình sẽ gửi hướng dẫn đặt lại mật khẩu.", button: "Gửi hướng dẫn" },
  "reset-password": { title: "Đặt lại mật khẩu", description: "Mở liên kết trong email và chọn một mật khẩu mới cho tài khoản.", button: "Lưu mật khẩu mới" },
  "verify-email": { title: "Xác thực email của bạn", description: "Xác nhận liên kết từ email để hoàn tất việc xác thực tài khoản.", button: "Xác thực email" },
  "resend-verification": { title: "Gửi lại email xác thực", description: "Nhập email đã đăng ký để nhận lại liên kết xác thực.", button: "Gửi email xác thực" },
};
export type AuthMode = keyof typeof modes;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const tokenRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const config = modes[mode];
  const needsToken = mode === "verify-email" || mode === "reset-password";
  const needsPassword = mode === "login" || mode === "register" || mode === "reset-password";

  useEffect(() => {
    if (!needsToken) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token && tokenRef.current) {
      tokenRef.current.value = token;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [needsToken]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    if (!needsToken) payload.email = String(form.get("email")).trim();
    if (needsToken) payload.token = String(form.get("token")).trim();
    if (needsPassword) payload.password = String(form.get("password"));
    if (mode === "register") payload.full_name = String(form.get("full_name")).trim();
    if (needsPassword && mode !== "login" && payload.password !== form.get("confirm_password")) {
      setError("Mật khẩu xác nhận chưa khớp."); return;
    }
    setPending(true);
    try {
      if (mode === "login") {
        await api<User>("/auth/login", jsonBody(payload), false);
        router.replace("/courses");
      } else {
        const result = await api<{ message: string }>(`/auth/${mode}`, jsonBody(payload), false);
        setMessage(result.message);
        if (mode !== "forgot-password" && mode !== "resend-verification") setCompleted(true);
      }
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  return <div className="grid min-h-dvh lg:grid-cols-[0.95fr_1.05fr]">
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex xl:p-16">
      <Brand light />
      <div className="relative z-10 max-w-md py-16">
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1 text-sm text-teal-50"><span className="size-1.5 rounded-full bg-teal-200" />Mỗi ngày, hiểu thêm một chút.</span>
        <h2 className="text-5xl leading-[1.18] font-semibold ">Một nơi gọn gàng.<br /><span className="text-teal-200">Một khởi đầu tốt.</span></h2>
        <p className="mt-6 text-lg leading-relaxed text-teal-50/85">Sắp xếp môn học, kết nối với lớp và dành sự tập trung cho điều quan trọng: việc học của bạn.</p>
        <div className="mt-10 space-y-5">{[[BookOpen, "Môn học theo cách của bạn"], [Users, "Kết nối cùng lớp học"], [ShieldCheck, "Không gian riêng, quyền rõ ràng"]].map(([Icon, text]) => { const ItemIcon = Icon as typeof BookOpen; return <div key={String(text)} className="flex items-center gap-3 text-sm"><span className="rounded-lg bg-white/10 p-2"><ItemIcon className="size-4" /></span>{String(text)}</div>; })}</div>
      </div>
      <p className="text-sm text-teal-100/75">StudyFlow AI · Không gian học tập có định hướng</p>
      <div aria-hidden="true" className="pointer-events-none absolute -right-44 -bottom-44 size-[520px] rounded-full border-[70px] border-white/5" />
    </aside>
    <main className="flex min-w-0 flex-col px-6 py-8 sm:px-12">
      <div className="lg:hidden"><Brand /></div>
      <Link href="/" className="mt-6 inline-flex w-fit items-center gap-2 text-sm text-muted-foreground lg:mt-0"><ArrowLeft className="size-4" />Về trang chủ</Link>
      <div className="mx-auto my-auto w-full max-w-[420px] py-12">
        <span className="mb-6 flex size-12 items-center justify-center rounded-2xl border bg-card text-primary">{needsToken ? <ShieldCheck /> : mode.includes("password") ? <Mail /> : <BookOpen />}</span>
        <h1 className="text-3xl leading-tight font-semibold ">{config.title}</h1>
        <p className="mt-3 text-muted-foreground">{config.description}</p>
        <div className="mt-7 space-y-5">
          <Feedback error={error} message={message} />
          {completed ? <div className="space-y-5"><div className="flex items-center gap-2 text-primary"><Check className="size-5" />Yêu cầu đã hoàn tất</div><Button className="h-11 w-full" onClick={() => router.push("/login")}>Đến trang đăng nhập<ArrowRight /></Button></div> : <form onSubmit={submit} className="grid gap-5">
            {mode === "register" && <div className="field"><Label htmlFor="full_name">Họ và tên</Label><Input id="full_name" name="full_name" required maxLength={200} autoComplete="name" className="app-input" placeholder="Họ tên của bạn" /></div>}
            {!needsToken && <div className="field"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="app-input" placeholder="ban@example.com" /></div>}
            {needsToken && <div className="field"><Label htmlFor="token">Mã xác thực từ email</Label><Input ref={tokenRef} id="token" name="token" required minLength={32} maxLength={256} autoComplete="off" className="app-input" placeholder="Mã được điền khi mở liên kết email" /><p className="text-xs text-muted-foreground">Nếu chưa có mã, hãy mở lại liên kết trong email.</p></div>}
            {needsPassword && <div className="field"><div className="flex items-center justify-between gap-3"><Label htmlFor="password">{mode === "reset-password" ? "Mật khẩu mới" : "Mật khẩu"}</Label>{mode === "login" && <Link href="/forgot-password" className="text-xs font-medium text-primary">Quên mật khẩu?</Link>}</div><PasswordInput id="password" name="password" required minLength={mode === "login" ? 1 : 8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} className="app-input" />{mode !== "login" && <p className="text-xs text-muted-foreground">Từ 8 đến 128 ký tự.</p>}</div>}
            {needsPassword && mode !== "login" && <div className="field"><Label htmlFor="confirm_password">Nhập lại mật khẩu</Label><PasswordInput id="confirm_password" name="confirm_password" required minLength={8} maxLength={128} autoComplete="new-password" className="app-input" /></div>}
            <SubmitButton pending={pending}>{config.button}<ArrowRight /></SubmitButton>
          </form>}
        </div>
        <div className="mt-7 space-y-3 text-center text-sm text-muted-foreground">
          {mode === "login" ? <><p>Chưa có tài khoản? <Link href="/register" className="font-semibold text-primary">Đăng ký ngay</Link></p><p><Link href="/resend-verification" className="text-xs underline underline-offset-4">Gửi lại email xác thực</Link></p></> : <Link href="/login" className="font-medium text-primary">Quay lại đăng nhập</Link>}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Học có tổ chức. Tiến bộ từng bước.</p>
    </main>
  </div>;
}
