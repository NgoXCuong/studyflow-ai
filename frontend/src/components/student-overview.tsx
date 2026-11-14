"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, Clock3, Play, RefreshCw } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResource } from "@/hooks/use-resource";
import { errorMessage } from "@/lib/api";
import { purposeLabel, scopeLabel } from "@/lib/attempts";
import { listAll, type Course } from "@/lib/courses";
import { topicStatusLabel, type CourseAnalysis } from "@/lib/learning-analysis";
import { cn } from "@/lib/utils";
import type { OverviewTask, StudentOverview as OverviewData } from "@/lib/overview";
import { examDateLabel, taskKindLabel, vietnamDateTime } from "@/lib/study-plans";

const panelClass = "min-w-0 gap-0 rounded-xl border border-primary/20 py-0 shadow-sm ring-0";

export function StudentOverview() {
  const { user } = useUser();
  if (user.role !== "student") return <EmptyState title="Tổng quan học tập dành cho sinh viên" description="Mở lớp học hoặc khu vực quản trị để tiếp tục công việc của bạn."><Link href={user.role === "admin" ? "/admin/users" : "/classrooms"} className={buttonVariants({ className: "min-h-11" })}>Đến không gian của bạn<ArrowRight /></Link></EmptyState>;
  return <OverviewContent />;
}

function OverviewContent() {
  const params = useSearchParams();
  const courseId = params.get("course_id");
  const { data, error, reload } = useResource<OverviewData>(`/overview${courseId ? `?course_id=${encodeURIComponent(courseId)}` : ""}`);
  if (error) return <div className="space-y-4"><ErrorState message={error} retry={reload} /><Link href="/overview" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>Về tổng quan mặc định</Link></div>;
  if (!data) return <LoadingState />;
  const progress = data.plan_progress;
  return <div className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><p className="text-xs text-muted-foreground">{examDateLabel(data.date)} · Giờ Việt Nam</p><h1 className="page-heading">Tổng quan học tập</h1><p className="text-sm leading-relaxed text-muted-foreground">Theo dõi lịch học, tiếp tục bài đang làm và chọn đúng phần cần ôn.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="ghost" className="min-h-11 gap-2" onClick={reload}><RefreshCw />Làm mới</Button><Link href="/study-plans" className={buttonVariants({ className: "min-h-11 gap-2" })}><CalendarDays />Mở kế hoạch</Link></div></header>
    <Card className={`${panelClass} bg-muted/20`}><CardContent className="p-4 sm:p-5"><dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">{[
      { label: "Còn lại hôm nay", value: data.today_count, note: "Đang diễn ra hoặc sắp tới", icon: CalendarDays },
      { label: "Nhiệm vụ quá hạn", value: data.overdue_count, note: "Đã hết giờ, chưa hoàn thành", icon: Clock3 },
      { label: "Nhiệm vụ hoàn thành", value: `${progress.completed_task_count}/${progress.task_count}`, note: progress.task_count ? "Theo xác nhận của bạn" : "Chưa có nhiệm vụ trong kế hoạch", icon: Check },
      { label: "Kế hoạch ôn tập", value: progress.plan_count, note: "Trong các môn còn quyền truy cập", icon: BookOpen },
    ].map(({ label, value, note, icon: Icon }, index) => <div key={label} className={cn("space-y-2", index % 2 !== 0 && "border-l border-primary/15 pl-4", index === 2 && "lg:border-l lg:border-primary/15 lg:pl-4")}><dt className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground"><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />{label}</dt><dd className={cn("break-words text-2xl font-semibold tabular-nums", index === 1 && data.overdue_count > 0 && "text-amber-800")}>{value}</dd><dd className="text-xs leading-relaxed text-muted-foreground">{note}</dd></div>)}</dl>
      {progress.task_count > 0 && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-primary/10 pt-3"><p className="text-xs text-muted-foreground">Tiến độ nhiệm vụ theo xác nhận của bạn</p><div className="flex min-w-32 max-w-sm flex-1 items-center gap-3"><div role="progressbar" aria-label="Tỷ lệ nhiệm vụ đã hoàn thành" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.completed_task_count / progress.task_count * 100)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${progress.completed_task_count / progress.task_count * 100}%` }} /></div><span className="text-xs font-medium tabular-nums text-primary">{Math.round(progress.completed_task_count / progress.task_count * 100)}%</span></div></div>}
    </CardContent></Card>
    <OverviewStatistics data={data} />
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Card className={panelClass}><CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Việc học tiếp theo</h2><Link href="/study-plans" className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-primary hover:underline">Tất cả kế hoạch<ArrowRight className="size-3.5" /></Link></div>
          <Tabs defaultValue={!data.today_count && data.overdue_count ? "overdue" : "today"} className="min-w-0 gap-4"><TabsList variant="line" className="h-auto max-w-full flex-wrap justify-start gap-3 group-data-horizontal/tabs:h-auto" aria-label="Phạm vi lịch học"><TabsTrigger value="today" className="min-h-11 flex-none px-1 data-active:text-primary after:bg-primary">Hôm nay ({data.today_count})</TabsTrigger><TabsTrigger value="overdue" className="min-h-11 flex-none px-1 data-active:text-primary after:bg-primary">Quá hạn ({data.overdue_count})</TabsTrigger></TabsList>
            <TabsContent value="today"><Agenda tasks={data.today_tasks} total={data.today_count} overdue={false} /></TabsContent>
            <TabsContent value="overdue"><Agenda tasks={data.overdue_tasks} total={data.overdue_count} overdue /></TabsContent>
          </Tabs>
          {progress.unscheduled_task_count > 0 && <div className="space-y-1 border-t pt-4 text-sm text-amber-900"><p className="font-medium">{progress.unscheduled_task_count} nhiệm vụ cần điều chỉnh</p><p className="text-xs leading-relaxed">Chưa có lịch hoặc nguồn không còn khả dụng. Bổ sung thời gian hoặc nguồn rồi xếp lại.</p><Link href="/study-plans" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Điều chỉnh kế hoạch<ArrowRight className="size-4" /></Link></div>}
        </CardContent></Card>
        <Card className={`${panelClass} bg-accent/30`}><CardContent className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Tiếp tục làm quiz</h2><Play className="size-5 text-primary" aria-hidden="true" /></div><p className="text-sm text-muted-foreground">Tối đa 5 lượt đang làm gần nhất.</p>
          {!data.active_attempts.length ? <div className="space-y-1 border-t pt-3"><p className="text-sm text-muted-foreground">Không có quiz đang làm dở.</p><Link href="/quizzes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Chọn quiz để luyện tập<ArrowRight className="size-4" /></Link></div> : <div className="divide-y">{data.active_attempts.map(attempt => <div key={attempt.id} className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0"><p className="break-words text-xs font-medium text-primary">{attempt.course_title}</p><h3 className="break-words font-semibold">{attempt.title}</h3><p className="text-xs text-muted-foreground">{purposeLabel[attempt.purpose]} · {scopeLabel[attempt.scope]}</p><p className="text-xs text-muted-foreground">Đã lưu {attempt.answered_count}/{attempt.question_count} lựa chọn</p><Link href={`/attempts/${attempt.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Play className="size-4" />Tiếp tục làm bài</Link></div>)}</div>}
        </CardContent></Card>
      </div>
      <div className="min-w-0 space-y-4">
        <OverviewTopics analysis={data.analysis} />
        <Card className={panelClass}><CardContent className="space-y-3 p-4 sm:p-5"><h2 className="text-lg font-semibold">Kết quả gần đây</h2><p className="text-sm leading-relaxed text-muted-foreground">5 lượt nộp gần nhất, gồm cả làm lại và luyện câu sai. Điểm theo từng lượt.</p>
          {!data.recent_attempts.length ? <p className="text-sm leading-relaxed text-muted-foreground">Chưa có bài quiz đã nộp. Hoàn thành một quiz để xem kết quả tại đây.</p> : <div className="divide-y">{data.recent_attempts.map(attempt => <div key={attempt.id} className="min-w-0 space-y-2 py-3 first:pt-0 last:pb-0"><p className="break-words text-xs font-medium text-primary">{attempt.course_title}</p><div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{attempt.title}</h3><span className="shrink-0 text-lg font-semibold">{attempt.score?.toFixed(2) ?? "—"}<span className="text-xs font-normal text-muted-foreground">/10</span></span></div><p className="text-xs leading-relaxed text-muted-foreground">{purposeLabel[attempt.purpose]} · {scopeLabel[attempt.scope]}{attempt.submitted_at ? ` · ${vietnamDateTime(attempt.submitted_at)}` : ""}</p><Link href={`/attempts/${attempt.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">Xem bài đã nộp<ArrowRight className="size-4" /></Link></div>)}</div>}
          <Link href="/quizzes" className="inline-flex min-h-11 items-center gap-1.5 border-t pt-3 text-sm text-primary hover:underline">Quiz & lịch sử<ArrowRight className="size-4" /></Link>
        </CardContent></Card>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Dữ liệu cập nhật lúc {vietnamDateTime(data.generated_at)} (UTC+7). Chọn Làm mới để lấy thay đổi mới nhất.</p>
  </div>;
}

function OverviewStatistics({ data }: { data: OverviewData }) {
  const progress = data.plan_progress;
  const future = Math.max(0, progress.task_count - progress.completed_task_count - data.today_count - data.overdue_count - progress.unscheduled_task_count);
  const reports = [
    {
      title: "Phân bố nhiệm vụ", subtitle: "Tất cả kế hoạch còn quyền truy cập", total: progress.task_count, unit: "nhiệm vụ",
      empty: "Tạo kế hoạch ôn tập để bắt đầu theo dõi nhiệm vụ.",
      segments: [
        { label: "Hoàn thành", count: progress.completed_task_count, color: "stroke-emerald-600", dot: "bg-emerald-600" },
        { label: "Quá hạn", count: data.overdue_count, color: "stroke-amber-500", dot: "bg-amber-500" },
        { label: "Còn lại hôm nay", count: data.today_count, color: "stroke-primary", dot: "bg-primary" },
        { label: "Lịch sắp tới", count: future, color: "stroke-sky-500", dot: "bg-sky-500" },
        { label: "Chưa xếp được lịch", count: progress.unscheduled_task_count, color: "stroke-slate-400", dot: "bg-slate-400" },
      ],
      note: "Hoàn thành do bạn xác nhận, không phải mức thành thạo.",
    },
    {
      title: "Trạng thái chủ đề", subtitle: data.analysis?.course_title ?? "Chưa chọn môn học", total: data.analysis?.topics.length ?? 0, unit: "chủ đề",
      empty: "Chưa có chủ đề để thống kê. Thêm chủ đề hoặc làm quiz từ tài liệu.",
      segments: [
        { label: "Cần ôn", count: data.analysis?.topics.filter(topic => topic.status === "needs_review").length ?? 0, color: "stroke-amber-500", dot: "bg-amber-500" },
        { label: "Tạm ổn", count: data.analysis?.topics.filter(topic => topic.status === "on_track").length ?? 0, color: "stroke-emerald-600", dot: "bg-emerald-600" },
        { label: "Chưa đủ dữ liệu", count: data.analysis?.topics.filter(topic => topic.status === "insufficient_data").length ?? 0, color: "stroke-slate-400", dot: "bg-slate-400" },
      ],
      note: "Chỉ tính môn đang chọn trong phần Phân tích theo môn.",
    },
  ];
  const recent = data.recent_attempts.filter((attempt): attempt is typeof attempt & { score: number } => attempt.score !== null).reverse();
  return <section className="space-y-3" aria-label="Biểu đồ báo cáo và thống kê">
    <h2 className="text-base font-semibold">Báo cáo & thống kê</h2>
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {reports.map(report => <Card key={report.title} className={panelClass}><CardContent className="flex flex-col gap-3 p-4">
        <div className="space-y-1"><h3 className="font-semibold">{report.title}</h3><p className="break-words text-xs text-muted-foreground">{report.subtitle}</p></div>
        {!report.total ? <p className="flex min-h-16 items-center text-sm leading-relaxed text-muted-foreground">{report.empty}</p> : <figure className="flex flex-wrap items-center justify-center gap-3" aria-label={report.title}>
          <svg viewBox="0 0 120 120" className="size-32 shrink-0" role="img" aria-label={`${report.total} ${report.unit}. ${report.segments.map(segment => `${segment.label}: ${segment.count}`).join(", ")}`}>
            <circle cx="60" cy="60" r="44" fill="none" strokeWidth="12" className="stroke-muted" />
            {report.segments.filter(segment => segment.count > 0).map((segment, index, segments) => <circle key={segment.label} cx="60" cy="60" r="44" fill="none" strokeWidth="12" pathLength="100" className={segment.color} strokeDasharray={`${segment.count / report.total * 100} ${100 - segment.count / report.total * 100}`} strokeDashoffset={-segments.slice(0, index).reduce((sum, item) => sum + item.count / report.total * 100, 0)} transform="rotate(-90 60 60)" />)}
            <text x="60" y="59" textAnchor="middle" className="fill-foreground text-[22px] font-semibold">{report.total}</text><text x="60" y="76" textAnchor="middle" className="fill-muted-foreground text-[10px]">{report.unit}</text>
          </svg>
          <figcaption className="min-w-0 flex-1 basis-32"><dl className="space-y-2">{report.segments.map(segment => <div key={segment.label} className="flex items-center justify-between gap-3 text-xs"><dt className="flex items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", segment.dot)} />{segment.label}</dt><dd className="font-semibold tabular-nums">{segment.count}</dd></div>)}</dl></figcaption>
        </figure>}
        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">{report.note}</p>
      </CardContent></Card>)}
      <Card className={cn(panelClass, "md:col-span-2 2xl:col-span-1")}><CardContent className="flex flex-col gap-3 p-4">
        <div className="space-y-1"><h3 className="font-semibold">Điểm quiz gần đây</h3><p className="text-xs text-muted-foreground">Tối đa 5 lượt đã nộp · theo thứ tự cũ đến mới</p></div>
        {!recent.length ? <p className="flex min-h-16 items-center text-sm leading-relaxed text-muted-foreground">Chưa có bài đã nộp để vẽ biểu đồ điểm.</p> : <figure className="space-y-1" aria-label="Điểm từng lượt quiz gần đây">
          <svg viewBox="0 0 320 180" className="h-36 w-full" role="img" aria-label={recent.map((attempt, index) => `Lượt ${index + 1}: ${attempt.score?.toFixed(2)}/10, ${attempt.title}, ${scopeLabel[attempt.scope]}`).join("; ")}>
            {[0, 5, 10].map(score => <g key={score}><line x1="28" x2="314" y1={144 - score * 12} y2={144 - score * 12} className="stroke-border" strokeDasharray={score ? "3 3" : undefined} /><text x="20" y={148 - score * 12} textAnchor="end" className="fill-muted-foreground text-[10px]">{score}</text></g>)}
            {recent.map((attempt, index) => {
              const slot = 280 / recent.length;
              const width = Math.min(36, slot * 0.6);
              const x = 32 + slot * index + (slot - width) / 2;
              const height = attempt.score * 12;
              return <g key={attempt.id}><title>{attempt.title} · {scopeLabel[attempt.scope]} · {attempt.score?.toFixed(2)}/10</title><rect x={x} y={144 - height} width={width} height={height} rx="4" className="fill-primary" /><text x={x + width / 2} y={136 - height} textAnchor="middle" className="fill-foreground text-[11px] font-medium">{attempt.score?.toFixed(2)}</text><text x={x + width / 2} y="162" textAnchor="middle" className="fill-muted-foreground text-[10px]">L{index + 1}</text></g>;
            })}
          </svg>
          <figcaption className="flex flex-wrap gap-x-3 gap-y-1">{recent.map((attempt, index) => <Link key={attempt.id} href={`/attempts/${attempt.id}`} title={`${attempt.title} · ${attempt.submitted_at ? vietnamDateTime(attempt.submitted_at) : "Chưa có ngày nộp"} · ${scopeLabel[attempt.scope]}`} className="inline-flex min-h-9 items-center text-xs text-primary hover:underline" aria-label={`Xem lượt ${index + 1}: ${attempt.title}, ${attempt.score?.toFixed(2)}/10`}>L{index + 1}: {attempt.score?.toFixed(2)} điểm</Link>)}</figcaption>
        </figure>}
        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">Thang điểm 10. Các lượt có thể khác quiz hoặc hình thức luyện, không phải xu hướng năng lực.</p>
      </CardContent></Card>
    </div>
  </section>;
}

function Agenda({ tasks, total, overdue }: { tasks: OverviewTask[]; total: number; overdue: boolean }) {
  if (!tasks.length) return <div className="space-y-2 py-3"><h3 className="text-sm font-medium">{overdue ? "Không có nhiệm vụ quá hạn" : "Không còn nhiệm vụ có lịch cho hôm nay"}</h3><p className="text-sm leading-relaxed text-muted-foreground">{overdue ? "Các nhiệm vụ đã hết thời gian dự kiến và chưa hoàn thành sẽ xuất hiện tại đây." : "Tiếp tục một quiz đang làm hoặc mở kế hoạch để chuẩn bị buổi học tiếp theo."}</p></div>;
  return <div className="divide-y">{tasks.map(task => <article key={task.id} className="min-w-0 space-y-2 py-3 first:pt-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{taskKindLabel[task.kind]} · {task.duration_minutes} phút</span>{overdue && <span className="inline-flex items-center gap-1 font-medium text-amber-800"><Clock3 className="size-3.5" />Quá hạn</span>}</div><p className="break-words text-xs font-medium text-primary">{task.course_title}</p><h3 className="break-words text-sm font-semibold">{task.topic}</h3><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{vietnamDateTime(task.scheduled_at)}</p><Link href={`/study-plans?plan_id=${task.plan_id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">{overdue ? "Xem & điều chỉnh" : "Mở nhiệm vụ"}<ArrowRight className="size-4" /></Link></div></article>)}{total > tasks.length && <p className="pt-3 text-xs text-muted-foreground">Hiển thị {tasks.length}/{total} nhiệm vụ, theo giờ bắt đầu sớm nhất. Xem các kế hoạch để theo dõi đầy đủ.</p>}</div>;
}

function OverviewTopics({ analysis }: { analysis: CourseAnalysis | null }) {
  const router = useRouter();
  const id = useId();
  const [courses, setCourses] = useState<{ data?: Course[]; error?: string }>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listAll<Course>("/courses", controller.signal).then(data => { if (!controller.signal.aborted) setCourses({ data }); }, error => { if (!controller.signal.aborted) setCourses({ error: errorMessage(error) }); });
    return () => controller.abort();
  }, [revision]);
  const needsReview = analysis?.topics.filter(topic => topic.status === "needs_review") ?? [];
  const unknown = analysis?.topics.filter(topic => topic.status === "insufficient_data").length ?? 0;
  return <Card className={panelClass}><CardContent className="space-y-3 p-4 sm:p-5"><div><h2 className="text-lg font-semibold">Phân tích theo môn</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">So sánh tỷ lệ đúng giữa các chủ đề để chọn phần cần ôn tiếp theo.</p></div>
    {courses.error ? <ErrorState message={courses.error} retry={() => { setCourses({}); setRevision(value => value + 1); }} /> : courses.data && courses.data.length > 0 ? <div className="field"><Label htmlFor={id}>Môn học đang xem</Label><Select value={analysis?.course_id ?? null} onValueChange={value => { if (value) router.replace(`/overview?course_id=${value}`); }} items={courses.data.map(course => ({ value: course.id, label: course.title }))}><SelectTrigger id={id} className="min-h-11 w-full"><SelectValue placeholder="Chọn môn học" /></SelectTrigger><SelectContent>{courses.data.map(course => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div> : !courses.data ? <p role="status" className="text-sm text-muted-foreground">Đang tải danh sách môn…</p> : null}
    {!analysis ? <div className="space-y-2"><h3 className="text-sm font-medium">Bắt đầu từ một môn học</h3><p className="text-sm leading-relaxed text-muted-foreground">Tạo môn cá nhân hoặc tham gia lớp, học từ tài liệu và làm quiz để có kết quả theo chủ đề.</p><Link href="/courses" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Đến môn học<ArrowRight className="size-4" /></Link></div> : <>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><span className="inline-flex items-center gap-1.5 text-amber-800"><span className="size-2 rounded-full bg-amber-500" />{needsReview.length} cần ôn</span><span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="size-2 rounded-full bg-emerald-600" />{analysis.topics.filter(topic => topic.status === "on_track").length} tạm ổn</span><span className="text-muted-foreground">{unknown} chưa đủ dữ liệu</span></div>
      {analysis.topics.length > 0 && <figure className="space-y-4" aria-labelledby={`${id}-chart-title`}>
        <figcaption id={`${id}-chart-title`} className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground"><span>Tỷ lệ đúng theo chủ đề · thang 0–100%</span><span>Vạch dọc: ngưỡng {analysis.review_threshold}%</span></figcaption>
        {analysis.topics.slice(0, 6).map(topic => <div key={topic.topic_key} className="space-y-1.5">
          <div className="flex items-start justify-between gap-3"><Link href={`/progress?course_id=${analysis.course_id}`} className="min-w-0 break-words text-sm font-medium hover:text-primary hover:underline">{topic.topic}</Link><span className={cn("shrink-0 text-sm font-semibold tabular-nums", topic.status === "needs_review" ? "text-amber-800" : topic.status === "on_track" ? "text-emerald-700" : "text-muted-foreground")}>{topic.status === "insufficient_data" || topic.accuracy === null ? "—" : `${topic.accuracy}%`}</span></div>
          {topic.status !== "insufficient_data" && topic.accuracy !== null ? <div className="relative h-2.5 rounded-full bg-muted" aria-hidden="true"><div className={cn("h-full rounded-full", topic.status === "needs_review" ? "bg-amber-500" : "bg-emerald-600")} style={{ width: `${topic.accuracy}%` }} /><span className="absolute -top-0.5 h-3.5 w-px bg-foreground/50" style={{ left: `${analysis.review_threshold}%` }} /></div> : <p className="text-xs text-muted-foreground">Chưa đủ dữ liệu · {topic.question_count}/{analysis.minimum_questions} câu khác nhau đã làm</p>}
          {topic.status !== "insufficient_data" && <p className="text-xs text-muted-foreground">{topicStatusLabel[topic.status]} · {topic.correct_count}/{topic.question_count} câu đúng{topic.initial_accuracy !== null ? ` · Lần đầu ${topic.initial_accuracy}%` : ""}</p>}
        </div>)}
        {analysis.topics.length > 6 && <p className="text-xs text-muted-foreground">Hiển thị 6/{analysis.topics.length} chủ đề theo thứ tự ưu tiên từ kết quả phân tích. Xem chi tiết để theo dõi đầy đủ.</p>}
      </figure>}
      {!needsReview.length && <p className="text-sm leading-relaxed text-muted-foreground">{!analysis.topics.length ? "Môn này chưa có chủ đề để phân tích. Thêm chủ đề hoặc tạo quiz từ tài liệu để bắt đầu." : unknown ? "Làm quiz đầu vào cho các chủ đề chưa đủ dữ liệu để có căn cứ đánh giá." : "Chưa có chủ đề cần ôn theo kết quả quan sát hiện tại."}</p>}
      {needsReview.length > 0 && <div className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Phần cần tập trung</h3>{needsReview.slice(0, 3).map(topic => <p key={topic.topic_key} className="text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{topic.topic}: </span>{topic.reason}</p>)}</div>}
      <p className="text-xs leading-relaxed text-muted-foreground">Đánh giá từ ít nhất {analysis.minimum_questions} câu khác nhau; dưới {analysis.review_threshold}% đúng là Cần ôn. Đây là kết quả quan sát, không xác nhận mức thành thạo. Luyện câu sai được thống kê riêng.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-2"><Link href={`/progress?course_id=${analysis.course_id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">Chi tiết kết quả<ArrowRight className="size-4" /></Link><Link href={`/study-plans?course_id=${analysis.course_id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline"><CalendarDays className="size-4" />Lập kế hoạch ôn tập</Link></div>
    </>}
  </CardContent></Card>;
}
