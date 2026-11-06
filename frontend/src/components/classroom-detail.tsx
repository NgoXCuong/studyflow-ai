"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, KeyRound, LockKeyhole, Users } from "lucide-react";
import { useUser } from "@/components/study-shell";
import { ClassroomEditor, ConfirmAction } from "@/components/study-forms";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, formatDate } from "@/lib/api";
import { useResource } from "@/hooks/use-resource";
import type { Classroom, Course, Member } from "@/lib/courses";
import { DocumentList } from "@/components/document-list";

export function ClassroomDetail() {
  const { classroomId } = useParams<{ classroomId: string }>();
  return <ClassroomContent key={classroomId} classroomId={classroomId} />;
}

function ClassroomContent({ classroomId }: { classroomId: string }) {
  const { data, error, reload } = useResource<Classroom>(`/classrooms/${classroomId}`);
  const [joinCode, setJoinCode] = useState("");
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <ClassroomWorkspace classroom={data} reload={reload} joinCode={joinCode} onJoinCode={setJoinCode} />;
}

function ClassroomWorkspace({ classroom, reload, joinCode, onJoinCode }: { classroom: Classroom; reload: () => void; joinCode: string; onJoinCode: (code: string) => void }) {
  const { user } = useUser();
  const router = useRouter();
  const { data: course, error, reload: reloadCourse } = useResource<Course>(`/courses/${classroom.course_id}`);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const canManage = user.role === "teacher" && course?.owner_id === user.id;
  async function rotate() {
    setPending(true); setActionError("");
    try {
      const result = await api<{ join_code: string }>(`/classrooms/${classroom.id}/join-code`, { method: "POST" });
      onJoinCode(result.join_code); reload();
    } catch (err) { setActionError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function toggle() {
    setPending(true); setActionError("");
    try { await api(`/classrooms/${classroom.id}`, { method: "PATCH", body: JSON.stringify({ join_enabled: !classroom.join_enabled }) }); reload(); }
    catch (err) { setActionError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(joinCode); setCopied(true); }
    catch { setActionError("Chưa sao chép được. Bạn có thể chọn và sao chép mã trong ô bên dưới."); }
  }
  if (error) return <ErrorState message={error} retry={reloadCourse} />;
  if (!course) return <LoadingState />;
  return <div className="space-y-7"><Link href="/classrooms" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Tất cả lớp học</Link>
    <div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="secondary">{canManage ? "Lớp phụ trách" : "Lớp đang tham gia"}</Badge><Badge variant="outline">{classroom.join_enabled ? "Đang nhận thành viên" : "Đã đóng tham gia"}</Badge></div><h1 className="page-heading break-words">{classroom.title}</h1><Link href={`/courses/${course.id}`} className="mt-3 inline-flex items-center gap-2 text-sm text-primary">{course.title}<ArrowRight className="size-4" /></Link></div><div className="flex flex-wrap gap-2">{canManage ? <><ClassroomEditor courseId={course.id} classroom={classroom} onSaved={reload} /><ConfirmAction title="Xóa lớp học?" description={`Lớp “${classroom.title}” sẽ không còn truy cập được. Mã tham gia cũng sẽ ngừng hoạt động.`} action={() => api(`/classrooms/${classroom.id}`, { method: "DELETE" })} onDone={() => router.push("/classrooms")} /></> : user.role === "student" && <ConfirmAction label="Rời lớp" icon={<ArrowLeft />} title="Rời khỏi lớp học?" description="Bạn sẽ mất quyền truy cập lớp này. Muốn tham gia lại, bạn cần mã tham gia còn hiệu lực." action={() => api(`/classrooms/${classroom.id}/members/me`, { method: "DELETE" })} onDone={() => router.push("/classrooms")} variant="outline" />}</div></div>
    {canManage ? <><Card className="border border-primary/15 bg-accent/40 shadow-none py-0"><CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]"><div><KeyRound className="mb-3 size-6 text-primary" /><h2 className="text-lg font-semibold">Mã tham gia lớp</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Mã chỉ được hiển thị ngay sau khi tạo. Hãy sao chép và chia sẻ cho sinh viên; tạo mã mới sẽ vô hiệu mã cũ và mở tham gia lớp.</p></div><div className="space-y-4">{joinCode && <div className="space-y-2"><Label htmlFor="current-join-code">Mã vừa tạo trong phiên này</Label><div className="flex gap-2"><Input id="current-join-code" value={joinCode} readOnly className="app-input min-w-0 font-mono text-sm" onFocus={event => event.target.select()} /><Button variant="outline" className="h-11 shrink-0" onClick={copy} aria-label="Sao chép mã tham gia">{copied ? <Check /> : <Copy />}</Button></div>{copied && <p role="status" className="text-xs text-primary">Đã sao chép mã.</p>}</div>}<div className="flex flex-wrap gap-2">{classroom.join_enabled || joinCode ? <ConfirmAction label="Tạo mã mới" icon={<KeyRound />} title="Thay mã tham gia?" description="Mã cũ sẽ không thể sử dụng. Mã mới chỉ hiển thị ngay sau khi tạo và lớp sẽ mở nhận thành viên." action={async () => { const result = await api<{ join_code: string }>(`/classrooms/${classroom.id}/join-code`, { method: "POST" }); onJoinCode(result.join_code); }} onDone={reload} variant="outline" /> : <Button className="h-11" disabled={pending} onClick={rotate}><KeyRound />{pending ? "Đang tạo…" : "Tạo mã tham gia"}</Button>}<Button variant="outline" className="h-11" onClick={toggle} disabled={pending}><LockKeyhole />{pending ? "Đang xử lý…" : classroom.join_enabled ? "Đóng tham gia" : "Mở tham gia"}</Button></div><Feedback error={actionError} /></div></CardContent></Card><Members classroomId={classroom.id} /></> : <Card className="border shadow-none py-0"><CardContent className="p-6"><Users className="mb-4 size-7 text-primary" /><h2 className="text-lg font-semibold">Bạn đang ở trong lớp học</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Mở môn học để xem các chương và chủ đề được giảng viên sắp xếp. Danh sách thành viên chỉ dành cho giảng viên phụ trách.</p><Link href={`/courses/${course.id}`} className={buttonVariants({ className: "mt-5", size: "lg" })}>Xem nội dung môn học<ArrowRight /></Link></CardContent></Card>}
    <DocumentList course={course} classrooms={[classroom]} classroomId={classroom.id} />
  </div>;
}

function Members({ classroomId }: { classroomId: string }) {
  const [includeLeft, setIncludeLeft] = useState(false);
  const [page, setPage] = useState(0);
  const { data, error, reload } = useResource<Member[]>(`/classrooms/${classroomId}/members?include_left=${includeLeft}&limit=21&offset=${page * 20}`);
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Thành viên lớp học</h2><p className="mt-1 text-sm text-muted-foreground">Danh sách sinh viên trong phạm vi lớp phụ trách.</p></div><div className="flex items-center gap-2.5"><Checkbox id="include-left" checked={includeLeft} onCheckedChange={value => { setIncludeLeft(value); setPage(0); }} /><Label htmlFor="include-left" className="cursor-pointer text-sm font-normal">Bao gồm sinh viên đã rời lớp</Label></div></div>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>{data.length ? <div className="overflow-hidden rounded-2xl border bg-card"><Table><TableHeader><TableRow><TableHead className="px-5">Sinh viên</TableHead><TableHead>Ngày tham gia</TableHead><TableHead>Trạng thái</TableHead><TableHead><span className="sr-only">Thao tác</span></TableHead></TableRow></TableHeader><TableBody>{data.slice(0, 20).map(member => <TableRow key={member.student_id}><TableCell className="max-w-xs px-5 py-4 font-medium whitespace-normal break-words">{member.full_name}</TableCell><TableCell>{formatDate(member.joined_at)}</TableCell><TableCell><Badge variant={member.left_at ? "outline" : "secondary"}>{member.left_at ? "Đã rời lớp" : "Đang tham gia"}</Badge>{member.left_at && <p className="mt-1 text-xs text-muted-foreground">{formatDate(member.left_at)}</p>}</TableCell><TableCell className="text-right">{!member.left_at && <ConfirmAction label="Xóa khỏi lớp" title="Xóa thành viên khỏi lớp?" description={`Sinh viên “${member.full_name}” sẽ mất quyền truy cập lớp học này.`} action={() => api(`/classrooms/${classroomId}/members/${member.student_id}`, { method: "DELETE" })} onDone={reload} />}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="Chưa có thành viên trong danh sách" description="Chia sẻ mã tham gia để sinh viên kết nối với lớp học của bạn." />}<Pagination page={page} hasNext={data.length > 20} onPage={setPage} /></>}
  </section>;
}
