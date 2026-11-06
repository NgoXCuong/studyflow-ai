"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { BookOpen, ChevronRight, ClipboardList, GraduationCap, LogOut, Menu, ShieldCheck, UserRound, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { ErrorState, Feedback, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api, ApiError, errorMessage, roleLabel, type User } from "@/lib/api";
import { cn } from "@/lib/utils";

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
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(errorMessage(err));
      },
    );
    return () => controller.abort();
  }, [router, revision]);

  async function logout() {
    setPending(true); setLogoutError("");
    try { await api("/auth/logout", { method: "POST" }, false); router.replace("/login"); }
    catch (err) { setLogoutError(errorMessage(err)); }
    finally { setPending(false); }
  }

  if (!user) return <main className="mx-auto max-w-4xl p-8"><Brand /><div className="mt-12">{error ? <><ErrorState message={error} retry={() => { setError(""); setRevision(v => v + 1); }} /><Button className="mt-4" onClick={() => router.replace("/login")}>Đến trang đăng nhập</Button></> : <LoadingState />}</div></main>;

  const links = [
    { href: "/courses", label: "Môn học", icon: BookOpen },
    { href: "/classrooms", label: "Lớp học", icon: Users },
    ...(user.role === "admin" ? [
      { href: "/admin/users", label: "Quản lý tài khoản", icon: ShieldCheck },
      { href: "/admin/audit-logs", label: "Nhật ký quản trị", icon: ClipboardList },
    ] : []),
    { href: "/profile", label: "Hồ sơ & bảo mật", icon: UserRound },
  ];
  const active = links.find(link => pathname === link.href || pathname.startsWith(`${link.href}/`))
    ?? (pathname.startsWith("/documents/") ? links.find(link => link.href === "/courses") : undefined);
  const navigation = <nav aria-label="Không gian học tập" className="space-y-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={active?.href === href ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors", active?.href === href ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="size-[18px]" />{label}{active?.href === href && <span className="ml-auto size-1.5 rounded-full bg-primary" />}</Link>)}</nav>;

  return <UserContext.Provider value={{ user, updateUser: setUser }}><a href="#main-content" className="sr-only z-50 rounded-lg bg-card p-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Đến nội dung chính</a><div className="min-h-dvh lg:grid lg:grid-cols-[228px_minmax(0,1fr)]">
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card px-4 py-5 lg:flex"><Brand /><p className="mt-8 mb-3 px-3 text-[11px] font-semibold text-muted-foreground uppercase">Không gian của bạn</p>{navigation}<div className="mt-auto"><div className="mb-5 rounded-xl border bg-background p-4"><GraduationCap className="mb-2 size-5 text-primary" /><p className="text-sm font-medium">{user.role === "admin" ? "Quản trị có kiểm soát." : "Từng bước, thật vững."}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{user.role === "admin" ? "Theo dõi tài khoản, quản lý quyền và đối chiếu nhật ký thay đổi." : "Bắt đầu với một môn học và những chủ đề bạn muốn khám phá."}</p></div><div className="flex min-w-0 items-center gap-3 border-t pt-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-primary">{user.full_name.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="text-xs text-muted-foreground">{roleLabel[user.role]}</p></div><Button variant="ghost" size="icon" aria-label="Đăng xuất" disabled={pending} onClick={logout}><LogOut /></Button></div></div></aside>
    <div className="flex min-h-dvh min-w-0 flex-col"><header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8"><div className="flex min-w-0 items-center gap-3"><Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Mở điều hướng" />}><Menu /></SheetTrigger><SheetContent side="left" className="max-w-xs"><SheetHeader><SheetTitle>StudyFlow AI</SheetTitle><SheetDescription>Điều hướng không gian học tập</SheetDescription></SheetHeader><div className="px-4">{navigation}<Button variant="outline" className="mt-6 w-full" onClick={logout} disabled={pending}><LogOut />Đăng xuất</Button></div></SheetContent></Sheet><span className="hidden text-sm text-muted-foreground sm:inline">Không gian học tập</span><ChevronRight className="hidden size-4 text-muted-foreground sm:block" /><span className="text-sm font-medium">{active?.label}</span></div><span className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" />{roleLabel[user.role]}</span></header>
      <main id="main-content" className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6"><Feedback error={logoutError} />{children}</main>
      <footer className="mx-4 mt-4 border-t py-4 text-xs text-muted-foreground sm:mx-6">StudyFlow AI <span className="px-2">/</span> Học có tổ chức. Tiến bộ từng bước.</footer>
    </div>
  </div></UserContext.Provider>;
}
