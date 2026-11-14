"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronRight, ClipboardList, FileClock, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, ShieldCheck, UserRound, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { ErrorState, Feedback, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api, ApiError, errorMessage, roleLabel, type User } from "@/lib/api";
import { cn } from "@/lib/utils";
import { classroomCodeFromHash } from "@/lib/classroom-invites";
import { toast } from "sonner";

const UserContext = createContext<{ user: User; updateUser: (user: User) => void } | null>(null);
export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used inside StudyShell");
  return context;
}

export function StudyShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<User>("/auth/me", { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) { setUser(data); setError(""); } },
      err => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          const code = window.location.pathname === "/classrooms" ? classroomCodeFromHash(window.location.hash) : null;
          router.replace(code ? `/login#join-code=${encodeURIComponent(code)}` : "/login");
        }
        else setError(errorMessage(err));
      },
    );
    return () => controller.abort();
  }, [router, revision]);

  async function logout() {
    setPending(true); setLogoutError("");
    try { await api("/auth/logout", { method: "POST" }, false); toast.success("Đã đăng xuất."); router.replace("/login"); }
    catch (err) { setLogoutError(errorMessage(err)); }
    finally { setPending(false); }
  }

  if (!user) return (
    <main className="grid min-h-dvh place-items-center bg-background p-5 sm:p-8">
      <div className={cn("w-full", error ? "max-w-xl rounded-3xl border bg-card p-6 sm:p-10" : "max-w-xs text-center")}>
        <div className={cn(!error && "flex justify-center")}><Brand /></div>
        <div className={error ? "mt-8" : "mt-2"}>
          {error ? <>
            <h1 className="mb-4 text-xl font-semibold">Chưa thể mở không gian học tập</h1>
            <ErrorState message={error} retry={() => { setError(""); setRevision(v => v + 1); }} />
            <Button variant="ghost" className="mt-4 min-h-11" onClick={() => router.replace("/login")}>Đến trang đăng nhập<ArrowUpRight /></Button>
          </> : <LoadingState />}
        </div>
      </div>
    </main>
  );

  const links = [
    ...(user.role === "student" ? [{ href: "/overview", label: "Tổng quan", icon: LayoutDashboard }] : []),
    { href: "/courses", label: "Môn học", icon: BookOpen },
    { href: "/classrooms", label: "Lớp học", icon: Users },
    ...(user.role !== "admin" ? [{ href: "/quizzes", label: user.role === "teacher" ? "Quiz & giao bài" : "Quiz & luyện tập", icon: ClipboardList }] : []),
    ...(user.role === "student" ? [{ href: "/progress", label: "Kết quả học tập", icon: ChartNoAxesCombined }, { href: "/study-plans", label: "Kế hoạch ôn tập", icon: CalendarDays }] : []),
    ...(user.role === "admin" ? [
      { href: "/admin/users", label: "Quản lý tài khoản", icon: ShieldCheck },
      { href: "/admin/processing", label: "Xử lý tài liệu", icon: FileClock },
      { href: "/admin/ai-usage", label: "Sử dụng AI", icon: Activity },
      { href: "/admin/audit-logs", label: "Nhật ký quản trị", icon: ClipboardList },
    ] : []),
    ...(user.role === "teacher" ? [{ href: "/reports", label: "Báo cáo học tập", icon: ChartNoAxesCombined }] : []),
    { href: "/profile", label: "Hồ sơ & bảo mật", icon: UserRound },
  ];
  const active = links.find(link => pathname === link.href || pathname.startsWith(`${link.href}/`))
    ?? (pathname.startsWith("/attempts/") ? links.find(link => link.href === "/quizzes")
      : pathname.startsWith("/documents/") ? links.find(link => link.href === "/courses") : undefined);
  const groups = [
    { label: "Không gian học tập", items: links.filter(link => ["/overview", "/courses", "/classrooms", "/quizzes", "/progress", "/study-plans", "/reports"].includes(link.href)) },
    { label: "Quản trị", items: links.filter(link => link.href.startsWith("/admin/")) },
    { label: "Tài khoản", items: links.filter(link => link.href === "/profile") },
  ].filter(group => group.items.length);
  const context = pathname.startsWith("/documents/") ? "Tài liệu & hỏi đáp"
    : pathname.startsWith("/attempts/") ? "Lượt làm quiz"
    : pathname.startsWith("/quizzes/") ? (user.role === "teacher" ? "Kết quả quiz" : "Luyện tập quiz")
    : pathname.startsWith("/courses/") ? "Chi tiết môn học"
    : pathname.startsWith("/classrooms/") ? "Chi tiết lớp học"
    : active?.label ?? "Không gian học tập";
  const workspaceLabel = user.role === "admin" ? "Không gian quản trị"
    : user.role === "teacher" ? "Không gian giảng dạy" : "Không gian của bạn";
  const initials = user.full_name.trim().split(/\s+/).slice(-2).map(word => word[0]).join("").toUpperCase();
  const navigation = (
    <nav aria-label="Điều hướng chính" className="space-y-7">
      {groups.map(group => <div key={group.label}>
        <p className="mb-2.5 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{group.label}</p>
        <div className="space-y-1">
          {group.items.map(({ href, label, icon: Icon }) => <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={active?.href === href ? (pathname === href ? "page" : "location") : undefined}
            className={cn(
              "group flex min-h-12 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors",
              active?.href === href ? "border-primary/15 bg-card text-primary shadow-sm shadow-primary/5" : "border-transparent text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" />
            <span>{label}</span>
            {active?.href === href && <ChevronRight className="ml-auto size-4" />}
          </Link>)}
        </div>
      </div>)}
    </nav>
  );
  const account = <div className="space-y-3 border-t pt-4">
    <Button variant="ghost" className="min-h-11 w-full justify-start gap-3 px-3 text-muted-foreground" disabled={pending} onClick={logout}><LogOut className="size-4" />{pending ? "Đang đăng xuất…" : "Đăng xuất"}</Button>
  </div>;

  return <UserContext.Provider value={{ user, updateUser: setUser }}>
    <a href="#main-content" className="sr-only z-50 rounded-lg bg-card p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Đến nội dung chính</a>
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh min-h-0 flex-col bg-background px-5 py-6 lg:flex">
        <div className="shrink-0 px-2"><Brand /><p className="mt-3 text-xs text-muted-foreground">Học từ tài liệu. Hiểu từ nguồn.</p></div>
        <div className="mt-8 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-5">
          <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-accent/60 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary"><GraduationCap className="size-5" /></span>
            <div className="min-w-0"><p className="text-sm font-semibold">{workspaceLabel}</p><p className="mt-0.5 text-xs text-muted-foreground">StudyFlow AI</p></div>
          </div>
          {navigation}
        </div>
        <div className="shrink-0">{account}</div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col bg-card lg:my-3 lg:mr-3 lg:min-h-[calc(100dvh-1.5rem)] lg:rounded-3xl lg:border lg:shadow-sm lg:shadow-foreground/[0.02]">
        <header className="sticky top-0 z-20 flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur-sm sm:px-7 lg:top-0 lg:rounded-t-3xl lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger render={<Button variant="outline" size="icon" className="size-11 shrink-0 lg:hidden" aria-label="Mở điều hướng" />}><Menu className="size-5" /></SheetTrigger>
              <SheetContent side="left" className="w-[min(320px,calc(100vw-2rem))]! gap-0 bg-background">
                <SheetHeader className="shrink-0 border-b p-6 pr-12"><SheetTitle>StudyFlow AI</SheetTitle><SheetDescription>{workspaceLabel}</SheetDescription></SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">{navigation}</div>
                <div className="shrink-0 px-5 pb-5">{account}</div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="mb-0.5 hidden text-[11px] font-medium tracking-wide text-muted-foreground sm:block">{workspaceLabel}</p>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                {active && active.label !== context && <><Link href={active.href} className="hidden shrink-0 text-muted-foreground hover:text-primary sm:inline">{active.label}</Link><ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" /></>}
                <span className="truncate font-semibold">{context}</span>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 max-w-[60%] items-center gap-3 sm:gap-5">
            <Link href="/" className="hidden min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary xl:inline-flex">Trang giới thiệu<ArrowUpRight className="size-3.5" /></Link>
            <Link href="/profile" aria-label={`Mở hồ sơ của ${user.full_name}`} title={user.full_name} className="flex min-w-0 items-center gap-2 rounded-xl py-1.5 pl-2 transition-colors hover:bg-accent/40 sm:gap-3">
              <span className="min-w-0 text-right"><span className="block max-w-28 truncate text-xs font-semibold sm:max-w-48 sm:text-sm">{user.full_name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">{roleLabel[user.role]}</span></span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/10 bg-accent text-sm font-semibold text-primary sm:size-11">{initials}</span>
            </Link>
          </div>
        </header>

        <main id="main-content" className={cn("mx-auto w-full min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:px-8", pathname === "/profile" || pathname.startsWith("/courses/") ? "max-w-none" : pathname.startsWith("/documents/") ? "max-w-[1600px]" : "max-w-[1440px]")}>
          <Feedback error={logoutError} />
          {children}
        </main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-2 border-t py-4 text-[11px] text-muted-foreground sm:mx-7 lg:mx-8">
          <span>StudyFlow AI <span className="px-1.5 text-border">/</span> Không gian học tập có định hướng</span>
          <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" />Tài liệu là điểm bắt đầu.</span>
        </footer>
      </div>
    </div>
  </UserContext.Provider>;
}
