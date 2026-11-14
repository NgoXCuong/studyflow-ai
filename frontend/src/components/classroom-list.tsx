"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, QrCode, Search, Users } from "lucide-react";
import { ClassroomScanner } from "@/components/classroom-invite";
import { useUser } from "@/components/study-shell";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination, SubmitButton } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api, errorMessage, formatDate, jsonBody } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import type { Classroom } from "@/lib/courses";
import { classroomCodeFromHash, parseClassroomInvite } from "@/lib/classroom-invites";

export default function ClassroomsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinValue, setJoinValue] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, error, reload } = useResource<Classroom[]>(`/classrooms?limit=13&offset=${page * 12}`);
  useEffect(() => {
    const readCode = () => { const code = classroomCodeFromHash(window.location.hash); if (code) setJoinValue(code); };
    readCode();
    window.addEventListener("hashchange", readCode);
    return () => window.removeEventListener("hashchange", readCode);
  }, []);
  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const code = parseClassroomInvite(joinValue, window.location.origin);
    if (!code) { setJoinError("Nhập mã lớp hoặc link mời hợp lệ trên cùng địa chỉ StudyFlow."); return; }
    setPending(true); setJoinError("");
    try {
      const classroom = await api<Classroom>("/classrooms/join", jsonBody({ join_code: code }));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      router.push(`/classrooms/${classroom.id}`);
    } catch (err) { setJoinError(errorMessage(err)); }
    finally { setPending(false); }
  }
  const visible = data?.slice(0, 12).filter(classroom => classroom.title.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi")));
  return <div className="min-w-0 space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="page-heading">Lớp học của bạn</h1><p className="text-sm leading-relaxed text-muted-foreground">{user.role === "teacher" ? "Quản lý bài học, tài liệu và thành viên. Mời cả lớp bằng một link hoặc mã QR." : "Kết nối với lớp, theo dõi tài liệu và luyện tập cùng giảng viên."}</p></div>{user.role === "teacher" && <Link href="/courses" className={buttonVariants({ className: "min-h-11 gap-2" })}><BookOpen />Môn giảng dạy<ArrowRight /></Link>}</header>
    {user.role === "student" && <Card className="gap-0 border border-primary/20 bg-accent/35 py-0 shadow-sm ring-0"><CardContent className="grid items-start gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="space-y-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="size-5 text-primary" />Tham gia lớp mới</h2><p className="text-sm leading-relaxed text-muted-foreground">Dán mã, mở link mời hoặc quét QR do giảng viên chia sẻ.</p></div><div className="min-w-0 space-y-3"><form onSubmit={join} className="space-y-2"><Label htmlFor="join-code" className="text-xs text-muted-foreground">Mã lớp hoặc link mời</Label><div className="flex flex-wrap gap-2"><Input id="join-code" name="join_code" value={joinValue} onChange={event => setJoinValue(event.target.value)} required maxLength={2048} autoComplete="off" disabled={pending} className="app-input min-w-0 flex-1 basis-48" placeholder="Dán mã lớp hoặc link tại đây" /><SubmitButton pending={pending}>Tham gia<ArrowRight /></SubmitButton></div><Feedback error={joinError} /></form><Dialog open={scannerOpen} onOpenChange={setScannerOpen}><DialogTrigger render={<Button variant="link" className="min-h-11 gap-2 px-0" disabled={pending} />}><QrCode />Quét mã QR / chọn ảnh</DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Quét QR tham gia lớp</DialogTitle><DialogDescription>Dùng camera hoặc chọn ảnh QR. Sau khi đọc mã, xác nhận bằng nút Tham gia.</DialogDescription></DialogHeader>{scannerOpen && <ClassroomScanner onCode={code => { setJoinValue(code); setJoinError(""); setScannerOpen(false); }} />}</DialogContent></Dialog></div></CardContent></Card>}
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4"><h2 className="font-semibold">{user.role === "teacher" ? "Lớp bạn phụ trách" : "Lớp đang tham gia"}</h2><div className="relative w-full sm:w-72"><Label htmlFor="classroom-search" className="sr-only">Tìm lớp trong trang này</Label><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="classroom-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm lớp trong trang này…" className="min-h-11 pl-9" /></div></div>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {data.length ? visible?.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(classroom => <Card key={classroom.id} className="gap-0 border border-primary/20 py-0 shadow-sm ring-0 transition-colors hover:border-primary/40"><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><Users className="mt-1 size-6 shrink-0 text-primary" /><Badge variant="outline" className="h-auto whitespace-normal text-right">{classroom.join_enabled ? "Đang nhận thành viên" : "Đã đóng tham gia"}</Badge></div><div className="space-y-2"><h3 className="break-words text-lg font-semibold"><Link href={`/classrooms/${classroom.id}`} className="hover:text-primary">{classroom.title}</Link></h3><p className="text-xs text-muted-foreground">Tạo ngày {formatDate(classroom.created_at)}</p></div><div className="flex items-center justify-between gap-3 border-t pt-3"><span className="text-xs text-muted-foreground">{user.role === "teacher" ? "Giảng viên phụ trách" : "Đang tham gia"}</span><Link href={`/classrooms/${classroom.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">Vào lớp<ArrowRight className="size-4" /></Link></div></CardContent></Card>)}</div> : <EmptyState title="Không tìm thấy lớp trong trang này" description="Thử tên khác hoặc chuyển sang trang lớp học tiếp theo." /> : <EmptyState title={page === 0 ? "Chưa có lớp học nào" : "Không còn lớp ở trang này"} description={user.role === "teacher" ? "Tạo môn giảng dạy trước, sau đó mở môn học để thêm lớp bạn phụ trách." : "Khi tham gia lớp thành công, lớp học sẽ xuất hiện tại đây."} />}
      <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
    </>}
  </div>;
}
