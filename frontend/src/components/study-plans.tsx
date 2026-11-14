"use client";

import { toast } from "sonner";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, ListChecks, Pencil, RefreshCw, Settings2 } from "lucide-react";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination, SubmitButton } from "@/components/feedback";
import { StudyPlanEditor } from "@/components/study-plan-editor";
import { ConfirmAction } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";
import { listAll, type Course } from "@/lib/courses";
import { cn } from "@/lib/utils";
import { examDateLabel, studyWeek, taskKindLabel, vietnamDateTime, vietnamInputTime, type PlanSummary, type StudyPlan, type StudyTask } from "@/lib/study-plans";

export function StudyPlans() {
  const { user } = useUser();
  if (user.role !== "student") return <EmptyState title="Kế hoạch ôn tập dành cho sinh viên" description="Giảng viên xem bài giao và kết quả trong khu vực lớp học." />;
  return <PlanList />;
}

function PlanList() {
  const router = useRouter();
  const params = useSearchParams();
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [courses, setCourses] = useState<{ data?: Course[]; error?: string }>({});
  const plans = useResource<PlanSummary[]>(`/study-plans?limit=13&offset=${page * 12}`);
  useEffect(() => {
    const controller = new AbortController();
    listAll<Course>("/courses", controller.signal).then(
      data => { if (!controller.signal.aborted) setCourses({ data }); },
      error => { if (!controller.signal.aborted) setCourses({ error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [revision]);
  if (courses.error) return <ErrorState message={courses.error} retry={() => { setCourses({}); setRevision(value => value + 1); }} />;
  if (!courses.data) return <LoadingState />;
  const availableCourses = courses.data;
  const selectedId = params.get("plan_id") ?? plans.data?.[0]?.id;
  function select(plan: StudyPlan) { plans.refresh(); router.replace(`/study-plans?plan_id=${plan.id}`); }
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6"><div className="min-w-0 space-y-2"><h1 className="page-heading">Kế hoạch ôn tập</h1><p className="text-sm text-muted-foreground">Một lịch học rõ ràng, từng bước đến ngày thi.</p></div><StudyPlanEditor courses={availableCourses} initialCourseId={params.get("course_id") ?? undefined} onSaved={select} /></header>
    {plans.error ? <ErrorState message={plans.error} retry={plans.reload} /> : !plans.data ? <LoadingState /> : <div className="min-w-0 space-y-5">
      <section className="min-w-0 space-y-3" aria-label="Danh sách kế hoạch">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {plans.data.length > 0 && <div className="min-w-0 flex-1 space-y-2 sm:max-w-md"><Label htmlFor="study-plan-select" className="text-xs text-muted-foreground">Kế hoạch đang xem</Label><Select value={selectedId ?? null} onValueChange={value => { if (value) router.replace(`/study-plans?plan_id=${value}`); }} items={plans.data.slice(0, 12).map(plan => ({ value: plan.id, label: `${plan.course_title} · ${examDateLabel(plan.exam_date)}` }))}><SelectTrigger id="study-plan-select" className="min-h-11 w-full bg-transparent"><SelectValue placeholder="Chọn kế hoạch" /></SelectTrigger><SelectContent>{plans.data.slice(0, 12).map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.course_title} · {examDateLabel(plan.exam_date)}</SelectItem>)}</SelectContent></Select></div>}
          <div className="flex items-center gap-2"><Pagination page={page} hasNext={plans.data.length > 12} onPage={setPage} /><Button variant="ghost" className="size-11" onClick={plans.reload} aria-label="Làm mới danh sách"><RefreshCw /></Button></div>
        </div>
        {!plans.data.length && <p className="text-sm leading-relaxed text-muted-foreground">Chưa có kế hoạch ở trang này. Tạo một kế hoạch để bắt đầu.</p>}
      </section>
      {selectedId ? <PlanResource key={selectedId} planId={selectedId} courses={availableCourses} onListChanged={plans.refresh} onDeleted={() => { plans.refresh(); router.replace("/study-plans"); }} /> : <EmptyState title="Một mục tiêu, một lịch ôn rõ ràng" description="Chọn môn, ngày thi và khoảng thời gian rảnh để bắt đầu ưu tiên các chủ đề cần ôn.">{availableCourses.length ? <StudyPlanEditor courses={availableCourses} initialCourseId={params.get("course_id") ?? undefined} onSaved={select} /> : <Link href="/courses" className={buttonVariants({ className: "min-h-11" })}>Thêm môn học trước<ArrowRight /></Link>}</EmptyState>}
    </div>}
  </div>;
}

function PlanResource({ planId, ...props }: { planId: string; courses: Course[]; onListChanged: () => void; onDeleted: () => void }) {
  const { data, error, reload } = useResource<StudyPlan>(`/study-plans/${planId}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <PlanWorkspace key={data.id} initial={data} {...props} />;
}

function PlanWorkspace({ initial, courses, onListChanged, onDeleted }: { initial: StudyPlan; courses: Course[]; onListChanged: () => void; onDeleted: () => void }) {
  const [plan, setPlan] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [weekAnchor, setWeekAnchor] = useState(() => initial.tasks.filter(task => task.scheduled_at && !task.completed_at).map(task => vietnamInputTime(task.scheduled_at!).slice(0, 10)).sort()[0] ?? vietnamInputTime(new Date().toISOString()).slice(0, 10));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const week = studyWeek(weekAnchor);
  const today = vietnamInputTime(new Date().toISOString()).slice(0, 10);
  const selectedTask = plan.tasks.find(task => task.id === selectedTaskId);
  const progress = plan.tasks.length ? Math.round(plan.tasks.filter(task => task.completed_at).length / plan.tasks.length * 100) : 0;
  const completed = plan.tasks.filter(task => task.completed_at);
  const unplanned = plan.tasks.filter(task => !task.completed_at && (!task.scheduled_at || task.unscheduled_reason));
  const scheduled = plan.tasks.filter(task => !task.completed_at && task.scheduled_at && !task.unscheduled_reason).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const agendaTasks = plan.tasks.filter(task => task.scheduled_at && (!task.unscheduled_reason || task.completed_at)).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!) || a.id.localeCompare(b.id));
  const days = new Map<string, StudyTask[]>();
  for (const task of agendaTasks) {
    const day = vietnamInputTime(task.scheduled_at!).slice(0, 10);
    const items = days.get(day) ?? [];
    items.push(task);
    days.set(day, items);
  }
  function saved(value: StudyPlan) { setPlan(value); onListChanged(); toast.success("Đã lưu kế hoạch và xếp lại phần chưa hoàn thành."); }
  async function reschedule() {
    if (pending) return;
    setPending(true); setError("");
    try { saved(await api<StudyPlan>(`/study-plans/${plan.id}/reschedule`, { method: "POST" })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function toggle(task: StudyTask, checked: boolean) {
    if (pending) return;
    setPending(true); setError("");
    try { setPlan(await api<StudyPlan>(`/study-plans/${plan.id}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ completed: checked }) })); toast.success(checked ? "Đã đánh dấu hoàn thành nhiệm vụ." : "Đã đưa nhiệm vụ về chưa hoàn thành."); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  function taskRow(task: StudyTask, detail = false) {
    const resource = task.kind === "read" ? task.document_id : task.quiz_id;
    const checkboxId = `task-${detail ? "detail-" : ""}${task.id}`;
    return <article key={task.id} className={cn("min-w-0 space-y-2 border-l-[3px] px-4 py-3 sm:px-5", task.completed_at ? "border-l-emerald-500 bg-emerald-50/50" : task.kind === "read" ? "border-l-sky-400" : task.kind === "quiz" ? "border-l-primary" : "border-l-amber-400")}>
      <div className="flex items-start gap-3"><Checkbox id={checkboxId} checked={!!task.completed_at} disabled={pending || !resource || (!task.scheduled_at && !task.completed_at)} onCheckedChange={checked => void toggle(task, checked)} className="mt-1" /><div className="min-w-0 flex-1"><Label htmlFor={checkboxId} className="cursor-pointer break-words font-semibold leading-relaxed">{task.topic}</Label><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{taskKindLabel[task.kind]}</span>{task.completed_at && <span className="inline-flex items-center gap-1 text-primary"><Check className="size-3.5" />Hoàn thành</span>}<span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{task.duration_minutes} phút</span></div></div></div>
      <p className="text-sm leading-relaxed text-muted-foreground">{task.reason}</p>
      {task.scheduled_at && <p className="flex items-start gap-2 text-xs font-medium tabular-nums"><CalendarDays className="size-3.5 shrink-0 text-muted-foreground" /><span>{vietnamDateTime(task.scheduled_at)} – {vietnamDateTime(new Date(Date.parse(task.scheduled_at) + task.duration_minutes * 60000).toISOString())}</span></p>}
      {task.unscheduled_reason && <p className="border-l-2 border-amber-300 pl-3 text-sm leading-relaxed text-amber-900">{task.unscheduled_reason}</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-primary/10 pt-1">
        {resource ? <Link href={task.kind === "read" ? `/documents/${task.document_id}${task.page_number ? `?page=${task.page_number}` : ""}` : `/quizzes/${task.quiz_id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">{task.kind === "read" ? <BookOpen className="size-4" /> : <ArrowRight className="size-4" />}{task.kind === "read" ? "Đọc nguồn & hỏi đáp" : "Mở quiz liên quan"}</Link> : <Link href={`/courses/${plan.course_id}?tab=documents`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">Bổ sung tài liệu / quiz<ArrowRight className="size-4" /></Link>}
        {!task.completed_at && resource && <TaskEditor planId={plan.id} task={task} disabled={pending} onSaved={value => { setPlan(value); toast.success("Đã cập nhật nhiệm vụ."); }} />}
      </div>
    </article>;
  }
  return <section className="min-w-0 space-y-5" aria-label="Chi tiết kế hoạch">
    <Card className="gap-0 border border-primary/20 bg-muted/20 py-0 shadow-sm ring-0"><CardContent className="p-4 sm:p-6"><header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-2"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />Thi ngày {examDateLabel(plan.exam_date)}</p><h2 className="break-words text-xl font-semibold sm:text-2xl">{plan.course_title}</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{plan.goal}</p></div>
        <Dialog><DialogTrigger render={<Button variant="ghost" className="min-h-11" />}><Settings2 />Thiết lập</DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Thiết lập kế hoạch</DialogTitle><DialogDescription>Điều chỉnh thời gian học hoặc xếp lại phần chưa hoàn thành. Nhiệm vụ đã hoàn thành được giữ nguyên.</DialogDescription></DialogHeader><div className="flex flex-col items-start gap-3"><StudyPlanEditor courses={courses} plan={plan} onSaved={saved} /><Button variant="ghost" className="min-h-11" disabled={pending} onClick={reschedule}><RefreshCw className={pending ? "animate-spin" : ""} />Xếp lại lịch</Button><Feedback error={error} /><div className="w-full border-t pt-4"><ConfirmAction label="Xóa kế hoạch" title="Xóa kế hoạch ôn tập?" description="Kế hoạch và các nhiệm vụ của kế hoạch này sẽ bị xóa. Kết quả làm quiz được giữ nguyên." action={() => api(`/study-plans/${plan.id}`, { method: "DELETE" })} onDone={onDeleted} variant="destructive" /></div></div></DialogContent></Dialog>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-primary/15 pt-4">
        <div className="w-full max-w-sm space-y-2"><div className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Đã hoàn thành</span><span className="font-medium text-primary">{completed.length}/{plan.tasks.length} nhiệm vụ · {progress}%</span></div><div role="progressbar" aria-label="Tiến độ hoàn thành kế hoạch" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>{scheduled.length} chờ thực hiện</span><span className={unplanned.length ? "text-amber-800" : ""}>{unplanned.length} chưa xếp lịch</span><Link href={`/progress?course_id=${plan.course_id}`} className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline">Kết quả theo chủ đề<ArrowRight className="size-3.5" /></Link></div>
      </div>
    </header></CardContent></Card>
    <Feedback error={error} />
    {!plan.tasks.length && <EmptyState title="Chưa có chủ đề để lập lịch" description="Thêm chủ đề hoặc tạo quiz trong môn học, sau đó yêu cầu xếp lại kế hoạch."><Link href={`/courses/${plan.course_id}`} className={buttonVariants({ className: "min-h-11" })}>Mở môn học<ArrowRight /></Link></EmptyState>}
    {unplanned.length > 0 && <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-900"><CircleHelp className="mt-0.5 size-4 shrink-0" /><span>{unplanned.length} nhiệm vụ chưa xếp lịch. Xem mục Cần điều chỉnh để bổ sung thời gian hoặc nguồn học.</span></p>}
    {plan.tasks.length > 0 && <Card className="min-w-0 gap-0 border border-primary/20 py-0 shadow-sm ring-0"><CardContent className="min-w-0 p-4 sm:p-6"><Tabs defaultValue="week" className="min-w-0 gap-4">
      <TabsList variant="line" className="h-auto max-w-full flex-wrap justify-start gap-3 group-data-horizontal/tabs:h-auto" aria-label="Chế độ xem kế hoạch">
        <TabsTrigger value="week" className="min-h-11 px-1 data-active:text-primary after:bg-primary"><CalendarDays />Lịch tuần</TabsTrigger>
        <TabsTrigger value="agenda" className="min-h-11 px-1 data-active:text-primary after:bg-primary"><ListChecks />Danh sách</TabsTrigger>
        <TabsTrigger value="unplanned" className="min-h-11 px-1 data-active:text-primary after:bg-primary">Cần điều chỉnh ({unplanned.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="week" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold" aria-live="polite">{examDateLabel(week[0])} – {examDateLabel(week[6])}</h3><p className="mt-1 text-xs text-muted-foreground">Giờ Việt Nam (UTC+7) · Chọn nhiệm vụ để xem chi tiết</p></div>
          <div className="flex items-center gap-1"><Button variant="ghost" className="size-11" aria-label="Tuần trước" onClick={() => setWeekAnchor(studyWeek(weekAnchor, -1)[0])}><ChevronLeft /></Button><Button variant="link" className="min-h-11" onClick={() => setWeekAnchor(vietnamInputTime(new Date().toISOString()).slice(0, 10))}>Hôm nay</Button><Button variant="ghost" className="size-11" aria-label="Tuần sau" onClick={() => setWeekAnchor(studyWeek(weekAnchor, 1)[0])}><ChevronRight /></Button></div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">{[{ kind: "read", color: "bg-sky-500" }, { kind: "quiz", color: "bg-primary" }, { kind: "review", color: "bg-amber-500" }].map(item => <span key={item.kind} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", item.color)} />{taskKindLabel[item.kind as StudyTask["kind"]]}</span>)}</div>
        <div className="overflow-x-auto rounded-lg border border-primary/15 bg-card">
          <div className="grid divide-y md:min-w-[980px] md:grid-cols-7 md:divide-x md:divide-y-0">
            {week.map((day, index) => {
              const tasks = plan.tasks.filter(task => task.scheduled_at && (!task.unscheduled_reason || task.completed_at) && vietnamInputTime(task.scheduled_at).slice(0, 10) === day).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
              return <section key={day} aria-label={`Lịch ngày ${examDateLabel(day)}`} className={cn("min-w-0 md:min-h-72", !tasks.length && "hidden md:block", day === today && "bg-accent/25")}>
                <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-3 md:flex-col md:items-start md:gap-1", day === today && "bg-accent/60")}><span className="text-xs text-muted-foreground">{["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"][index]}{day === today && " · Hôm nay"}</span><span className={cn("text-sm font-semibold", day === today && "text-primary")}>{day.slice(8)}/{day.slice(5, 7)}</span></div>
                <div className="space-y-2 p-2">{tasks.map(task => <Button key={task.id} variant="ghost" className={cn("h-auto min-h-24 w-full flex-col items-start gap-1.5 rounded-md px-2 py-3 text-left whitespace-normal", task.kind === "read" ? "bg-sky-50 text-sky-900 hover:bg-sky-100 hover:text-sky-900" : task.kind === "quiz" ? "bg-accent/70 text-accent-foreground hover:bg-accent hover:text-accent-foreground" : "bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-900", task.completed_at && "opacity-70")} onClick={() => setSelectedTaskId(task.id)} aria-label={`${taskKindLabel[task.kind]}: ${task.topic}, ${vietnamDateTime(task.scheduled_at!)}${task.completed_at ? ", đã hoàn thành" : ""}`}>
                  <span className="flex w-full items-center justify-between gap-1 text-xs font-semibold tabular-nums">{vietnamInputTime(task.scheduled_at!).slice(11, 16)} – {vietnamInputTime(new Date(Date.parse(task.scheduled_at!) + task.duration_minutes * 60000).toISOString()).slice(11, 16)}{task.completed_at && <Check className="size-3.5 shrink-0" />}</span>
                  <span className="w-full line-clamp-2 break-words text-sm font-medium">{task.topic}</span><span className="text-xs font-normal">{taskKindLabel[task.kind]} · {task.duration_minutes} phút</span>
                </Button>)}{!tasks.length && <p className="py-5 text-center text-xs text-muted-foreground">Không có lịch học</p>}</div>
              </section>;
            })}
          </div>
          {!plan.tasks.some(task => task.scheduled_at && (!task.unscheduled_reason || task.completed_at) && vietnamInputTime(task.scheduled_at).slice(0, 10) >= week[0] && vietnamInputTime(task.scheduled_at).slice(0, 10) <= week[6]) && <p className="border-t p-5 text-center text-sm text-muted-foreground">Tuần này chưa có nhiệm vụ. Chuyển tuần để xem lịch khác.</p>}
        </div>
      </TabsContent>
      <TabsContent value="agenda" className="space-y-5">
        <p className="text-xs leading-relaxed text-muted-foreground">Sắp xếp theo ngày và giờ học · Nhiệm vụ hoàn thành giữ nguyên vị trí.</p>
        {!agendaTasks.length && <p className="py-4 text-sm text-muted-foreground">Chưa có nhiệm vụ đã xếp lịch.</p>}
        {[...days].map(([day, tasks]) => <section key={day} aria-label={`Lịch ngày ${examDateLabel(day)}`} className="overflow-hidden rounded-xl border border-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 bg-primary/5 px-4 py-3 sm:px-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-primary" />{examDateLabel(day)}{day === today && <span className="text-xs font-normal text-primary">Hôm nay</span>}</h3>
            <p className="text-xs text-muted-foreground">{tasks.length} nhiệm vụ · {tasks.reduce((sum, task) => sum + task.duration_minutes, 0)} phút<span className="ml-3 font-medium text-primary">{tasks.filter(task => task.completed_at).length}/{tasks.length} hoàn thành</span></p>
          </div>
          <div className="divide-y divide-primary/15">{tasks.map(task => taskRow(task))}</div>
        </section>)}
      </TabsContent>
      <TabsContent value="unplanned" className="space-y-3">
        {!unplanned.length ? <EmptyState title="Các nhiệm vụ đều đã có lịch hoặc hoàn thành" description="Bạn có thể theo dõi các buổi học trong lịch tuần." /> : <><p className="text-sm leading-relaxed text-muted-foreground">Bổ sung khoảng rảnh hoặc tài liệu/quiz theo lý do của từng nhiệm vụ, sau đó xếp lại lịch. Nhiệm vụ đã hoàn thành được giữ nguyên.</p><div className="divide-y">{unplanned.map(task => taskRow(task))}</div></>}
      </TabsContent>
    </Tabs></CardContent></Card>}
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t pt-3"><p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">Bạn xác nhận hoàn thành nhiệm vụ; kết quả học tập tính từ quiz đã nộp. Xếp lại lịch chỉ thay đổi phần chưa hoàn thành.</p><Dialog><DialogTrigger render={<Button variant="link" className="min-h-11 px-0 text-xs" />}>Xem thời gian rảnh ({plan.availability.length})</DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Thời gian rảnh đã khai báo</DialogTitle><DialogDescription>Các khoảng học theo giờ Việt Nam (UTC+7). Thay đổi trong mục Thiết lập kế hoạch.</DialogDescription></DialogHeader><ul className="divide-y">{plan.availability.map((slot, index) => <li key={index} className="py-3 text-sm leading-relaxed">{vietnamDateTime(slot.start_at)} – {vietnamDateTime(slot.end_at)}</li>)}</ul></DialogContent></Dialog></footer>
    <Dialog open={!!selectedTask} onOpenChange={open => { if (!open) setSelectedTaskId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Chi tiết buổi học</DialogTitle><DialogDescription>{selectedTask ? `${taskKindLabel[selectedTask.kind]} · ${plan.course_title}` : "Nhiệm vụ trong kế hoạch ôn tập"}</DialogDescription></DialogHeader>{selectedTask && taskRow(selectedTask, true)}</DialogContent></Dialog>
  </section>;
}

function TaskEditor({ planId, task, disabled, onSaved }: { planId: string; task: StudyTask; disabled: boolean; onSaved: (plan: StudyPlan) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const start = String(form.get("scheduled_at"));
    setPending(true); setError("");
    try { onSaved(await api<StudyPlan>(`/study-plans/${planId}/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ scheduled_at: start ? `${start}:00+07:00` : null, duration_minutes: Number(form.get("minutes")) }) })); setOpen(false); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(""); } }}><DialogTrigger render={<Button variant="ghost" className="min-h-11" disabled={disabled} />}><Pencil />Chỉnh nhiệm vụ</DialogTrigger><DialogContent showCloseButton={!pending}><DialogHeader><DialogTitle>{taskKindLabel[task.kind]} · {task.topic}</DialogTitle><DialogDescription>Giờ Việt Nam (UTC+7). Chọn thời gian trong khoảng rảnh, không trùng nhiệm vụ khác. Để trống để bỏ lịch nhiệm vụ này.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><div className="field"><Label htmlFor={`${id}-start`}>Bắt đầu</Label><Input id={`${id}-start`} name="scheduled_at" type="datetime-local" defaultValue={task.scheduled_at ? vietnamInputTime(task.scheduled_at) : ""} disabled={pending} className="min-h-11" /></div><div className="field"><Label htmlFor={`${id}-minutes`}>Thời lượng dự kiến (phút)</Label><Input id={`${id}-minutes`} name="minutes" type="number" required min={1} max={1440} step={1} defaultValue={task.duration_minutes} disabled={pending} className="min-h-11" /></div><Feedback error={error} /><SubmitButton pending={pending}>Lưu nhiệm vụ</SubmitButton></form></DialogContent></Dialog>;
}
