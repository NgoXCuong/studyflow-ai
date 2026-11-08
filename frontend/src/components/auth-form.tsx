"use client";

import "./auth-form.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { api, errorMessage, jsonBody, type User } from "@/lib/api";

const modes = {
  login: {
    title: "Chào mừng bạn trở lại",
    description: "Đăng nhập để tiếp tục không gian học tập của bạn.",
    button: "Đăng nhập",
  },
  register: {
    title: "Tạo tài khoản",
    description: "Bắt đầu không gian học tập của riêng bạn.",
    button: "Tạo tài khoản",
  },
  "forgot-password": {
    title: "Quên mật khẩu?",
    description:
      "Nhập email tài khoản. Chúng mình sẽ gửi hướng dẫn đặt lại mật khẩu.",
    button: "Gửi hướng dẫn",
  },
  "reset-password": {
    title: "Đặt lại mật khẩu",
    description:
      "Mở liên kết trong email và chọn một mật khẩu mới cho tài khoản.",
    button: "Lưu mật khẩu mới",
  },
  "verify-email": {
    title: "Xác thực email của bạn",
    description:
      "Xác nhận liên kết từ email để hoàn tất việc xác thực tài khoản.",
    button: "Xác thực email",
  },
  "resend-verification": {
    title: "Gửi lại email xác thực",
    description: "Nhập email đã đăng ký để nhận lại liên kết xác thực.",
    button: "Gửi email xác thực",
  },
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
  const needsPassword =
    mode === "login" || mode === "register" || mode === "reset-password";

  useEffect(() => {
    if (!needsToken) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (token && tokenRef.current) {
      tokenRef.current.value = token;
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [needsToken]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    if (!needsToken) payload.email = String(form.get("email")).trim();
    if (needsToken) payload.token = String(form.get("token")).trim();
    if (needsPassword) payload.password = String(form.get("password"));
    if (mode === "register")
      payload.full_name = String(form.get("full_name")).trim();
    if (
      needsPassword &&
      mode !== "login" &&
      payload.password !== form.get("confirm_password")
    ) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setPending(true);
    try {
      if (mode === "login") {
        await api<User>("/auth/login", jsonBody(payload), false);
        router.replace("/courses");
      } else {
        const result = await api<{ message: string }>(
          `/auth/${mode}`,
          jsonBody(payload),
          false,
        );
        setMessage(result.message);
        if (mode !== "forgot-password" && mode !== "resend-verification")
          setCompleted(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`auth-shell auth-${mode}`}>
      <aside className="auth-story">
        <div className="auth-story-grain" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <Brand light />
          <span className="auth-edition">THE LEARNING SPACE</span>
        </div>
        <div className="auth-story-content">
          <div className="auth-kicker">
            <span /> TỪ TÀI LIỆU ĐẾN TRI THỨC
          </div>
          <h2>
            Học có chiều sâu.
            <br />
            <span>Tiến xa hơn.</span>
          </h2>
          <p>
            Mọi tài liệu đều là một khởi đầu.
            <br />
            Biến những điều bạn đọc thành điều bạn hiểu.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="auth-orbit auth-orbit-one" />
            <div className="auth-orbit auth-orbit-two" />
            <span className="auth-art-star">✳</span>
            <div className="auth-paper auth-paper-back">
              <div className="auth-paper-tab" />
              <span className="auth-paper-number">01 / KHÁM PHÁ</span>
              <div className="auth-paper-lines">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="auth-paper auth-paper-front">
              <div className="flex items-center justify-between">
                <span className="auth-paper-icon">
                  <FileText className="size-5" />
                </span>
                <span className="auth-paper-number">YOUR NEXT CHAPTER</span>
              </div>
              <div className="auth-paper-heading">
                Ý tưởng lớn,
                <br />
                <em>từ từng trang nhỏ.</em>
              </div>
              <div className="auth-paper-lines">
                <i />
                <i />
                <i />
              </div>
              <div className="auth-paper-bottom">
                <span>ĐỌC. HỎI. HIỂU.</span>
                <ArrowRight className="size-5" />
              </div>
            </div>
            <div className="auth-insight">
              <span className="auth-insight-icon">
                <Sparkles className="size-5" />
              </span>
              <div>
                <strong>Kết nối những điều bạn học</strong>
                <span>Hỏi từ tài liệu · Hiểu từ nguồn</span>
              </div>
              <Check className="ml-auto size-4" />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Không gian cho sự tập trung.</span>
          <div className="flex items-center gap-2">
            <span className="auth-footer-line" />
            StudyFlow AI
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="lg:hidden">
            <Brand />
          </div>
          <Link href="/" className="auth-back">
            <ArrowLeft className="size-4" />
            Về trang chủ
          </Link>
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <ShieldCheck className="size-3.5 text-primary" />
            Không gian học tập riêng
          </span>
        </header>
        <div className="auth-form-wrap">
          <div className="auth-form-kicker flex items-center gap-3">
            <span className="auth-form-icon">
              {needsToken ? (
                <ShieldCheck className="size-5" />
              ) : mode.includes("password") ? (
                <Mail className="size-5" />
              ) : (
                <BookOpen className="size-5" />
              )}
            </span>
            <Badge
              variant="outline"
              className="border-primary/20 bg-accent/50 px-3 py-1 text-[10px] tracking-[0.16em] text-primary uppercase"
            >
              {mode === "login"
                ? "TIẾP TỤC HÀNH TRÌNH"
                : mode === "register"
                  ? "MỘT KHỞI ĐẦU MỚI"
                  : "ĐỒNG HÀNH CÙNG BẠN"}
            </Badge>
          </div>
          <h1 className="auth-title">
            {config.title}
            {!config.title.endsWith("?") && (
              <span className="text-primary">.</span>
            )}
          </h1>
          <p className="auth-description text-sm text-muted-foreground">
            {config.description}
          </p>
          <div className="auth-form-body space-y-4">
            <Feedback error={error} message={message} />
            {completed ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-primary">
                  <Check className="size-5" />
                  Yêu cầu đã hoàn tất
                </div>
                <Button
                  className="h-11 w-full"
                  onClick={() => router.push("/login")}
                >
                  Đến trang đăng nhập
                  <ArrowRight />
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid gap-4">
                <fieldset
                  disabled={pending}
                  className="auth-fields grid min-w-0 gap-4"
                >
                  {mode === "register" && (
                    <div className="field">
                      <Label htmlFor="full_name">Họ và tên</Label>
                      <Input
                        id="full_name"
                        name="full_name"
                        required
                        maxLength={200}
                        autoComplete="name"
                        className="app-input auth-input"
                        placeholder="Họ tên của bạn"
                      />
                    </div>
                  )}
                  {!needsToken && (
                    <div className="field">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="email"
                        className="app-input auth-input"
                        placeholder="ban@example.com"
                      />
                    </div>
                  )}
                  {needsToken && (
                    <div className="field">
                      <Label htmlFor="token">Mã xác thực từ email</Label>
                      <Input
                        ref={tokenRef}
                        id="token"
                        name="token"
                        required
                        minLength={32}
                        maxLength={256}
                        autoComplete="off"
                        className="app-input auth-input"
                        placeholder="Mã được điền khi mở liên kết email"
                      />
                      <p className="text-xs text-muted-foreground">
                        Nếu chưa có mã, hãy mở lại liên kết trong email.
                      </p>
                    </div>
                  )}
                  {needsPassword && (
                    <div className="field">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="password">
                          {mode === "reset-password"
                            ? "Mật khẩu mới"
                            : "Mật khẩu"}
                        </Label>
                        {mode === "login" && (
                          <Link
                            href="/forgot-password"
                            className="text-xs font-medium text-primary"
                          >
                            Quên mật khẩu?
                          </Link>
                        )}
                      </div>
                      <PasswordInput
                        id="password"
                        name="password"
                        required
                        minLength={mode === "login" ? 1 : 8}
                        maxLength={128}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        className="app-input auth-input"
                      />
                      {mode !== "login" && (
                        <p className="text-xs text-muted-foreground">
                          Từ 8 đến 128 ký tự.
                        </p>
                      )}
                    </div>
                  )}
                  {needsPassword && mode !== "login" && (
                    <div className="field">
                      <Label htmlFor="confirm_password">
                        Nhập lại mật khẩu
                      </Label>
                      <PasswordInput
                        id="confirm_password"
                        name="confirm_password"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        className="app-input auth-input"
                      />
                    </div>
                  )}
                </fieldset>
                <Button
                  type="submit"
                  disabled={pending}
                  className="auth-submit"
                >
                  {pending ? <LoaderCircle className="animate-spin" /> : null}
                  {pending ? "Đang xử lý…" : config.button}
                  {!pending && <ArrowRight className="ml-auto size-4" />}
                </Button>
              </form>
            )}
          </div>
          <div className="auth-form-divider" />
          <div className="space-y-3 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                <p>
                  Chưa có tài khoản?{" "}
                  <Link href="/register" className="font-semibold text-primary">
                    Đăng ký ngay
                  </Link>
                </p>
                <p>
                  <Link
                    href="/resend-verification"
                    className="text-xs underline underline-offset-4"
                  >
                    Gửi lại email xác thực
                  </Link>
                </p>
              </>
            ) : (
              <Link href="/login" className="font-medium text-primary">
                Quay lại đăng nhập
              </Link>
            )}
          </div>
        </div>
        <footer className="auth-main-footer">
          <span>StudyFlow AI · Không gian học tập của bạn</span>
          <span>Học ít vội hơn. Hiểu sâu hơn.</span>
        </footer>
      </main>
    </div>
  );
}
