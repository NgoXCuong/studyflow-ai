"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleHelp, RefreshCw, Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResource } from "@/hooks/use-resource";
import { errorMessage } from "@/lib/api";
import { purposeLabel, scopeLabel, type StudentAttempt } from "@/lib/attempts";
import type { ClassroomReport, StudentReport, TopicReport } from "@/lib/classroom-reports";
import { listAll, type Classroom } from "@/lib/courses";
import { vietnamDateTime } from "@/lib/study-plans";

const tableClass = "min-w-0 overflow-hidden border-y border-primary/10";

export function ClassroomReports() {
  const { user } = useUser();
  if (user.role !== "teacher") return <EmptyState title="Báo cáo lớp dành cho giảng viên" description="Giảng viên chỉ xem kết quả bài giao trong các lớp mình phụ trách." />;
  return <ReportSelector />;
}

function ReportSelector() {
  const id = useId();
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<{ data?: Classroom[]; error?: string }>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listAll<Classroom>("/classrooms", controller.signal).then(data => { if (!controller.signal.aborted) setState({ data }); }, error => { if (!controller.signal.aborted) setState({ error: errorMessage(error) }); });
    return () => controller.abort();
  }, [revision]);
  function reload() { setState({}); setRevision(value => value + 1); }
  if (state.error) return <ErrorState message={state.error} retry={reload} />;
  if (!state.data) return <LoadingState />;
  const classroomId = params.get("classroom_id") ?? state.data[0]?.id;
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="page-heading">Báo cáo học tập</h1><p className="text-sm leading-relaxed text-muted-foreground">Theo dõi bài giao, kết quả theo chủ đề và các lượt nộp trong lớp phụ trách.</p></div><Button variant="ghost" className="min-h-11 gap-2" onClick={reload}><RefreshCw />Làm mới báo cáo</Button></header>
    {!state.data.length ? <EmptyState title="Chưa có lớp phụ trách" description="Tạo lớp trong môn giảng dạy, công bố tài liệu và duyệt giao quiz để bắt đầu theo dõi kết quả."><Link href="/courses" className={buttonVariants({ className: "min-h-11" })}>Đến môn giảng dạy<ArrowRight /></Link></EmptyState> : <>
      <div className="field sm:max-w-md"><Label htmlFor={id} className="text-xs text-muted-foreground">Lớp đang xem</Label><Select value={classroomId} onValueChange={value => { if (value) router.replace(`/reports?classroom_id=${value}`); }} items={state.data.map(classroom => ({ value: classroom.id, label: classroom.title }))}><SelectTrigger id={id} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{state.data.map(classroom => <SelectItem key={classroom.id} value={classroom.id}>{classroom.title}</SelectItem>)}</SelectContent></Select></div>
      {classroomId && <ReportWorkspace key={`${classroomId}-${revision}`} classroomId={classroomId} />}
    </>}
  </div>;
}

function ReportWorkspace({ classroomId }: { classroomId: string }) {
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("quizzes");
  const { data, error, reload } = useResource<ClassroomReport>(`/classrooms/${classroomId}/report?limit=21&offset=${page * 20}`);
  if (error) return <div className="space-y-4"><ErrorState message={error} retry={reload} /><Link href="/reports" className={buttonVariants({ variant: "link", className: "min-h-11 gap-1.5 px-0" })}>Chọn lại lớp<ArrowRight /></Link></div>;
  if (!data) return <LoadingState />;
  return <div className="min-w-0 space-y-6">
    <Card className="gap-0 border border-primary/20 bg-muted/20 py-0 shadow-sm ring-0"><CardContent className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1.5"><h2 className="break-words text-xl font-semibold">{data.classroom_title}</h2><Link href={`/courses/${data.course_id}`} className="inline-block break-words text-sm text-muted-foreground hover:text-primary hover:underline">{data.course_title}</Link></div><Link href={`/classrooms/${classroomId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><Users className="size-4" />Mở lớp học<ArrowUpRight className="size-4" /></Link></div>
      <dl className="grid grid-cols-3 divide-x divide-primary/15 border-t border-primary/10 pt-4">{[{ label: "Thành viên hiện tại", count: data.current_member_count }, { label: "Quiz đã giao còn truy cập", count: data.quiz_count }, { label: "Tổng lượt đã nộp", count: data.submitted_count }].map((item, index) => <div key={item.label} className={index ? "min-w-0 space-y-2 pl-3 sm:pl-6" : "min-w-0 space-y-2 pr-2"}><dt className="text-xs leading-relaxed text-muted-foreground">{item.label}</dt><dd className="text-2xl font-semibold tabular-nums sm:text-3xl">{item.count}</dd></div>)}</dl>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-primary/10 pt-2"><p className="text-xs leading-relaxed text-muted-foreground">Chỉ tính bài giao của lớp · Gồm các lượt làm lại và luyện câu sai</p><Dialog><DialogTrigger render={<Button variant="link" className="min-h-11 gap-1.5 px-0 text-xs" />}><CircleHelp />Phạm vi & cách tính</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Phạm vi báo cáo lớp</DialogTitle><DialogDescription>Báo cáo chỉ dùng kết quả bài giao trong lớp đang xem.</DialogDescription></DialogHeader><ul className="space-y-3 text-sm leading-relaxed"><li>Chỉ tính lượt đã nộp, gồm cả làm lại và luyện câu sai. Điểm trung bình tính theo từng lượt.</li><li>Lịch sử gồm cả sinh viên đã rời lớp. Số đã nộp/chưa nộp tính theo thành viên hiện tại.</li><li>Quiz cá nhân của sinh viên được giữ riêng và không đưa vào báo cáo này.</li></ul></DialogContent></Dialog></div>
    </CardContent></Card>
    <Card className="min-w-0 gap-0 border border-primary/20 py-0 shadow-sm ring-0"><CardContent className="min-w-0 p-4 sm:p-6"><Tabs value={tab} onValueChange={value => setTab(String(value))} className="min-w-0 gap-5"><TabsList variant="line" className="h-auto max-w-full flex-wrap justify-start gap-3 group-data-horizontal/tabs:h-auto" aria-label="Phạm vi báo cáo">{[{ value: "quizzes", label: "Theo quiz" }, { value: "topics", label: "Theo chủ đề" }, { value: "students", label: "Theo sinh viên" }, { value: "attempts", label: "Lượt đã nộp" }].map(item => <TabsTrigger key={item.value} value={item.value} className="min-h-11 flex-none px-1 data-active:text-primary after:bg-primary">{item.label}</TabsTrigger>)}</TabsList>
      <TabsContent value="quizzes"><div className="space-y-4">
        {!data.quizzes.length ? <EmptyState title={data.quiz_count ? "Không còn quiz ở trang này" : "Chưa có quiz đã giao"} description="Duyệt và giao quiz từ tài liệu lớp để theo dõi bài làm tại đây." /> : <div className={tableClass}><Table className="min-w-[940px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="px-5">Quiz</TableHead><TableHead>Số câu</TableHead><TableHead>Đã nộp / hiện tại</TableHead><TableHead>Chưa nộp</TableHead><TableHead>Lịch sử</TableHead><TableHead>Điểm TB</TableHead><TableHead className="text-right">Chi tiết</TableHead></TableRow></TableHeader><TableBody>{data.quizzes.slice(0, 20).map(quiz => <TableRow key={quiz.quiz_id}><TableCell className="max-w-xs px-5 py-4 whitespace-normal"><p className="break-words font-semibold">{quiz.title}</p><p className="mt-1 text-xs text-muted-foreground">Giao {vietnamDateTime(quiz.published_at)}</p></TableCell><TableCell>{quiz.question_count}</TableCell><TableCell>{quiz.current_submitted_count}/{data.current_member_count}</TableCell><TableCell>{quiz.current_not_submitted_count}</TableCell><TableCell><p>{quiz.submitted_count} lượt</p><p className="mt-1 text-xs text-muted-foreground">{quiz.student_count} sinh viên từng nộp</p></TableCell><TableCell className="font-semibold">{quiz.average_score === null ? "Chưa có bài nộp" : `${quiz.average_score.toFixed(2)}/10`}</TableCell><TableCell className="text-right"><Link href={`/quizzes/${quiz.quiz_id}`} className={buttonVariants({ variant: "link", className: "min-h-11 gap-1.5 px-0" })}>Bài làm & câu hay sai<ArrowRight /></Link></TableCell></TableRow>)}</TableBody></Table></div>}
        <Pagination page={page} hasNext={(page + 1) * 20 < data.quiz_count} onPage={setPage} />
      </div></TabsContent>
      <TabsContent value="topics"><TopicResults topics={data.topics} /></TabsContent>
      <TabsContent value="students"><StudentResults classroomId={classroomId} quizCount={data.quiz_count} /></TabsContent>
      <TabsContent value="attempts"><SubmittedAttempts classroomId={classroomId} /></TabsContent>
    </Tabs></CardContent></Card>
  </div>;
}

function TopicResults({ topics }: { topics: TopicReport[] }) {
  return <div className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">Đếm từng câu trả lời trong mọi lượt đã nộp, gồm lượt làm lại/luyện câu sai. Câu bỏ trống nằm trong số sai. Nhóm tên chủ đề sau khi bỏ khoảng trắng thừa và không phân biệt hoa/thường; không phải đánh giá cá nhân M11 hay mức thành thạo.</p>
    {!topics.length ? <EmptyState title="Chưa có kết quả theo chủ đề" description="Kết quả xuất hiện khi sinh viên nộp bài quiz được giao trong lớp." /> : <div className={tableClass}><Table className="min-w-[680px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="px-5">Chủ đề</TableHead><TableHead>Số câu trả lời</TableHead><TableHead>Đúng</TableHead><TableHead>Sai</TableHead><TableHead>Trong đó bỏ trống</TableHead><TableHead className="text-right">Tỷ lệ đúng</TableHead></TableRow></TableHeader><TableBody>{topics.map(topic => <TableRow key={topic.topic_key}><TableCell className="max-w-sm px-5 py-4 font-semibold whitespace-normal break-words">{topic.topic}</TableCell><TableCell>{topic.answer_count}</TableCell><TableCell>{topic.correct_count}</TableCell><TableCell>{topic.wrong_count}</TableCell><TableCell>{topic.skipped_count}</TableCell><TableCell className="text-right font-semibold">{topic.accuracy === null ? "—" : `${topic.accuracy}%`}</TableCell></TableRow>)}</TableBody></Table></div>}
  </div>;
}

function StudentResults({ classroomId, quizCount }: { classroomId: string; quizCount: number }) {
  const id = useId();
  const [page, setPage] = useState(0);
  const [includeLeft, setIncludeLeft] = useState(false);
  const [selected, setSelected] = useState<StudentReport | null>(null);
  const { data, error, reload } = useResource<StudentReport[]>(`/classrooms/${classroomId}/report/students?include_left=${includeLeft}&limit=21&offset=${page * 20}`);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Quiz đã nộp chỉ đếm mỗi quiz một lần; tổng lượt và điểm TB gồm mọi lượt nộp.</p><div className="flex min-h-11 items-center gap-2"><Checkbox id={id} checked={includeLeft} onCheckedChange={checked => { setIncludeLeft(checked); setPage(0); }} /><Label htmlFor={id} className="cursor-pointer font-normal">Gồm sinh viên đã rời lớp</Label></div></div>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length ? <EmptyState title="Không có sinh viên trong danh sách" description="Kiểm tra bộ lọc hoặc chia sẻ mã lớp để sinh viên tham gia." /> : <div className={tableClass}><Table className="min-w-[880px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="px-5">Sinh viên</TableHead><TableHead>Quiz đã nộp</TableHead><TableHead>Tổng lượt</TableHead><TableHead>Điểm TB</TableHead><TableHead>Nộp gần nhất</TableHead><TableHead className="text-right">Chi tiết</TableHead></TableRow></TableHeader><TableBody>{data.slice(0, 20).map(student => <TableRow key={student.student_id}><TableCell className="max-w-xs px-5 py-4 whitespace-normal"><p className="break-words font-semibold">{student.full_name}</p><Badge variant={student.left_at ? "outline" : "secondary"} className="mt-2">{student.left_at ? "Đã rời lớp" : "Đang tham gia"}</Badge></TableCell><TableCell>{student.submitted_quiz_count}/{quizCount}</TableCell><TableCell>{student.submitted_count}</TableCell><TableCell className="font-semibold">{student.average_score === null ? "Chưa có bài nộp" : `${student.average_score.toFixed(2)}/10`}</TableCell><TableCell className="text-xs text-muted-foreground">{student.last_submitted_at ? vietnamDateTime(student.last_submitted_at) : "—"}</TableCell><TableCell className="text-right"><Button variant="link" className="min-h-11 gap-1.5 px-0" onClick={() => setSelected(student)} disabled={!student.submitted_count}>Xem lượt đã nộp<ArrowRight /></Button></TableCell></TableRow>)}</TableBody></Table></div>}
      <Pagination page={page} hasNext={data.length > 20} onPage={setPage} />
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Bài đã nộp · {selected?.full_name}</DialogTitle><DialogDescription>Chỉ hiển thị lượt nộp cho bài giao trong lớp này. Mở từng lượt để xem câu trả lời và giải thích.</DialogDescription></DialogHeader>{selected && <SubmittedAttempts key={selected.student_id} classroomId={classroomId} studentId={selected.student_id} />}</DialogContent></Dialog>
  </div>;
}

function SubmittedAttempts({ classroomId, studentId }: { classroomId: string; studentId?: string }) {
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({ limit: "21", offset: String(page * 20) });
  if (studentId) query.set("student_id", studentId);
  const { data, error, reload } = useResource<StudentAttempt[]>(`/classrooms/${classroomId}/report/attempts?${query}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <div className="min-w-0 space-y-4">
    <div className="space-y-1"><h3 className="font-semibold">Lượt đã nộp{studentId ? " của sinh viên" : " trong lớp"}</h3><p className="text-xs leading-relaxed text-muted-foreground">Mỗi dòng là một lượt nộp. Mở bài để xem câu trả lời và giải thích.</p></div>
    {!data.length ? <EmptyState title="Chưa có lượt đã nộp" description="Bài đang làm chưa được đưa vào báo cáo." /> : <div className={tableClass}><Table className="min-w-[720px]"><TableHeader className="bg-muted/40"><TableRow><TableHead className="pl-3">Sinh viên / bài làm</TableHead><TableHead>Hình thức</TableHead><TableHead className="text-right">Điểm</TableHead><TableHead>Ngày nộp</TableHead><TableHead className="pr-3"><span className="sr-only">Xem bài đã nộp</span></TableHead></TableRow></TableHeader><TableBody>{data.slice(0, 20).map(attempt => <TableRow key={attempt.id}>
      <TableCell className="min-w-48 max-w-xs whitespace-normal py-4 pl-3"><p className="break-words font-semibold">{attempt.student_name}</p><p className="mt-1 break-words text-xs text-muted-foreground">{attempt.title}</p></TableCell>
      <TableCell className="text-xs"><p>{purposeLabel[attempt.purpose]}</p><p className="mt-1 text-muted-foreground">{scopeLabel[attempt.scope]}</p></TableCell>
      <TableCell className="text-right"><p className="font-semibold tabular-nums text-primary">{attempt.score === null ? "—" : <>{attempt.score.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/10</span></>}</p><p className="mt-1 text-xs text-muted-foreground">{attempt.correct_count ?? "—"}/{attempt.question_count} đúng</p></TableCell>
      <TableCell className="text-xs text-muted-foreground">{attempt.submitted_at ? vietnamDateTime(attempt.submitted_at) : "—"}</TableCell>
      <TableCell className="pr-3 text-right"><Link href={`/attempts/${attempt.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline" aria-label={`Xem bài đã nộp của ${attempt.student_name}`}>Xem bài<ArrowUpRight className="size-4" /></Link></TableCell>
    </TableRow>)}</TableBody></Table></div>}
    <Pagination page={page} hasNext={data.length > 20} onPage={setPage} />
  </div>;
}
