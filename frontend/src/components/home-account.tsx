"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type User } from "@/lib/api";

export function HomeAccount() {
  const [user, setUser] = useState<User | null>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<User>("/auth/me", { signal: controller.signal }).then(
      result => { if (!controller.signal.aborted) { setUser(result); setFailed(false); } },
      error => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) { setUser(null); setFailed(false); }
        else { setUser(undefined); setFailed(true); }
      },
    );
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); };
  }, []);

  if (failed) return <div className="home-account"><Button variant="outline" className="home-button" onClick={() => setRevision(value => value + 1)}>Thử lại phiên đăng nhập</Button></div>;
  if (user === undefined) return <div className="home-account" role="status"><span className="sr-only">Đang kiểm tra phiên đăng nhập</span><Skeleton className="h-11 w-36 rounded-lg" /></div>;
  if (!user) return <div className="home-account"><Link href="/login" className="home-login">Đăng nhập</Link><Link href="/register" className={buttonVariants({ className: "home-button" })}>Bắt đầu<ArrowUpRight /></Link></div>;

  return <div className="home-account home-account-signed-in">
    <Link href="/profile" className="home-profile" aria-label={`Hồ sơ của ${user.full_name}`} title={user.full_name}><UserRound className="size-4 shrink-0" /><span>{user.full_name}</span></Link>
    <Link href={user.role === "admin" ? "/admin/users" : "/courses"} className={buttonVariants({ className: "home-button" })}>{user.role === "admin" ? "Quản trị" : "Vào học"}<ArrowUpRight /></Link>
  </div>;
}
