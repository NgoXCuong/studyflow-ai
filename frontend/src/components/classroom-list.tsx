"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, KeyRound, Users } from "lucide-react";
import { useUser } from "@/components/study-shell";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination, SubmitButton } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { api, errorMessage, formatDate, jsonBody } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import type { Classroom } from "@/lib/courses";

export default function ClassroomsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [joinError, setJoinError] = useState("");
  const { data, error, reload } = useResource<Classroom[]>(`/classrooms?limit=13&offset=${page * 12}`);
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setJoinError("");
    try {
      const classroom = await api<Classroom>("/classrooms/join", jsonBody({ join_code: String(new FormData(event.currentTarget).get("join_code")).trim() }));
      router.push(`/classrooms/${classroom.id}`);
    } catch (err) { setJoinError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <div className="space-y-5"><div><p className="eyebrow mb-3">Kết nối để học cùng nhau</p><h1 className="page-heading">Lớp học của bạn</h1><p className="mt-3 text-muted-foreground">{user.role === "teacher" ? "Quản lý các lớp bạn phụ trách và thành viên trong lớp." : "Một không gian chung cho bạn và giảng viên."}</p></div>
    {user.role === "student" ? <Card className="border border-primary/15 bg-accent/60 shadow-none py-0"><CardContent className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1fr_1.2fr]"><div className="flex gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary"><KeyRound className="size-5" /></span><div><h2 className="font-semibold">Bạn có mã tham gia?</h2><p className="mt-1 text-sm text-muted-foreground">Nhập mã được giảng viên chia sẻ để kết nối với lớp.</p></div></div><form onSubmit={join} className="space-y-3"><Label htmlFor="join-code">Mã tham gia lớp</Label><div className="flex flex-col gap-3 sm:flex-row"><Input id="join-code" name="join_code" required minLength={16} maxLength={128} autoComplete="off" className="app-input min-w-0 flex-1" placeholder="Dán mã lớp từ giảng viên" /><SubmitButton pending={pending}>Tham gia<ArrowRight /></SubmitButton></div><Feedback error={joinError} /></form></CardContent></Card> : user.role === "teacher" ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5"><div><h2 className="font-semibold">Tạo lớp từ một môn giảng dạy</h2><p className="mt-1 text-sm text-muted-foreground">Mở môn học, chọn mục lớp học và tạo lớp mới.</p></div><Link href="/courses" className={buttonVariants({ variant: "outline", size: "lg" })}>Đến môn học<ArrowRight /></Link></div> : null}
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {data.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.slice(0, 12).map(classroom => <Card key={classroom.id} className="border shadow-none hover:border-primary/40 py-0"><CardContent className="p-5"><div className="mb-6 flex items-start justify-between gap-3"><span className="flex size-12 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><Users className="size-5" /></span><Badge variant="outline">{classroom.join_enabled ? "Đang nhận thành viên" : "Đã đóng tham gia"}</Badge></div><h2 className="text-xl font-semibold break-words"><Link href={`/classrooms/${classroom.id}`}>{classroom.title}</Link></h2><p className="mt-3 text-sm text-muted-foreground">{user.role === "teacher" ? "Lớp học bạn phụ trách" : "Lớp học bạn đang tham gia"}</p><div className="mt-7 flex items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">{formatDate(classroom.created_at)}</span><Link href={`/classrooms/${classroom.id}`} className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-primary">Vào lớp<ArrowRight className="size-4" /></Link></div></CardContent></Card>)}</div> : <EmptyState title={page === 0 ? "Chưa có lớp học nào" : "Không còn lớp ở trang này"} description={user.role === "teacher" ? "Tạo môn giảng dạy trước, sau đó mở môn học để thêm lớp bạn phụ trách." : "Khi tham gia lớp thành công, lớp học sẽ xuất hiện tại đây."} />}
      <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
    </>}
  </div>;
}
