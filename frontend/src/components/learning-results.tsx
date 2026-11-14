"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, BookOpen, History, RefreshCw, CircleHelp, CalendarDays } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/hooks/use-resource";
import { errorMessage, formatDate } from "@/lib/api";
import { purposeLabel, scopeLabel } from "@/lib/attempts";
import { listAll, type Course } from "@/lib/courses";
import { topicStatusLabel, type CourseAnalysis, type TopicHistory } from "@/lib/learning-analysis";
import { cn } from "@/lib/utils";

export function LearningResults() {
  const { user } = useUser();
  if (user.role !== "student") return <EmptyState title="Kết quả học tập cá nhân dành cho sinh viên" description="Giảng viên xem kết quả bài giao trong mục Quiz & giao bài." />;
  return <CourseResults />;
}

function CourseResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = useId();
  const [state, setState] = useState<{ data?: Course[]; error?: string }>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listAll<Course>("/courses", controller.signal).then(
      data => { if (!controller.signal.aborted) setState({ data }); },
      error => { if (!controller.signal.aborted) setState({ error: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, [revision]);
  if (state.error) return <ErrorState message={state.error} retry={() => { setState({}); setRevision(value => value + 1); }} />;
  if (!state.data) return <LoadingState />;
  const course = state.data.find(item => item.id === searchParams.get("course_id")) ?? state.data[0];
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6"><div className="min-w-0 space-y-2"><h1 className="page-heading">Kết quả học tập</h1><p className="text-sm leading-relaxed text-muted-foreground">Nhận biết chủ đề cần ôn và chọn bước học tiếp theo.</p></div>{course && <Link href={`/study-plans?course_id=${course.id}`} className={buttonVariants({ className: "min-h-11 gap-2" })}><CalendarDays />Lập kế hoạch ôn tập</Link>}</header>
    {!course ? <EmptyState title="Chưa có môn học để xem kết quả" description="Tạo môn cá nhân hoặc tham gia lớp, sau đó làm quiz để có dữ liệu theo chủ đề."><Link href="/courses" className={buttonVariants({ className: "min-h-11" })}>Đến môn học<ArrowRight /></Link></EmptyState> : <>
      <div className="field sm:max-w-md"><Label htmlFor={id} className="text-xs text-muted-foreground">Môn học đang xem</Label><Select value={course.id} onValueChange={value => { if (value) router.replace(`/progress?course_id=${value}`); }} items={state.data.map(item => ({ value: item.id, label: `${item.title} · ${item.kind === "personal" ? "Cá nhân" : "Lớp học"}` }))}><SelectTrigger id={id} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{state.data.map(item => <SelectItem key={item.id} value={item.id}>{item.title} · {item.kind === "personal" ? "Cá nhân" : "Lớp học"}</SelectItem>)}</SelectContent></Select></div>
      <AnalysisContent key={course.id} courseId={course.id} />
    </>}
  </div>;
}

function AnalysisContent({ courseId }: { courseId: string }) {
  const { data, error, reload } = useResource<CourseAnalysis>(`/courses/${courseId}/learning-analysis`);
  const [filter, setFilter] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState<string>();
  const id = useId();
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  const topics = filter === "all" ? data.topics : data.topics.filter(topic => topic.status === filter);
  return <div className="space-y-6">
    <Card aria-label="Tổng quan kết quả" className="gap-0 border border-primary/20 bg-muted/20 py-0 shadow-sm ring-0"><CardContent className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{data.topics.length} chủ đề trong môn học</h2><Dialog><DialogTrigger render={<Button variant="link" className="min-h-11 gap-1.5 px-0 text-xs" />}><CircleHelp />Cách tính kết quả</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cách đánh giá chủ đề</DialogTitle><DialogDescription>Kết quả phản ánh các bài đã làm, không phải xác nhận mức thành thạo.</DialogDescription></DialogHeader><ul className="space-y-3 text-sm leading-relaxed"><li>Cần ít nhất <strong>{data.minimum_questions} câu khác nhau</strong> để đánh giá. Dưới <strong>{data.review_threshold}% đúng</strong> được gắn nhãn Cần ôn.</li><li>Mỗi câu chỉ tính kết quả làm toàn bộ gần nhất. Câu trùng nội dung hoặc sao chép chỉ đếm một lần.</li><li>Kết quả luyện riêng câu sai được ghi riêng, không tăng số câu đánh giá.</li></ul></DialogContent></Dialog></div>
      <dl className="grid grid-cols-3 divide-x divide-primary/15">{(["needs_review", "on_track", "insufficient_data"] as const).map((status, index) => <div key={status} className={cn("space-y-2", index > 0 && "pl-3 sm:pl-6")}><dt className="flex items-center gap-2 text-xs text-muted-foreground"><span className={cn("size-2 shrink-0 rounded-full", status === "needs_review" ? "bg-amber-500" : status === "on_track" ? "bg-emerald-600" : "bg-slate-400")} />{topicStatusLabel[status]}</dt><dd className={cn("text-3xl font-semibold tabular-nums", status === "needs_review" ? "text-amber-800" : status === "on_track" ? "text-emerald-700" : "text-foreground")}>{data.topics.filter(topic => topic.status === status).length}<span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">chủ đề</span></dd></div>)}</dl>
      <p className="text-xs leading-relaxed text-muted-foreground">Đánh giá từ {data.minimum_questions} câu khác nhau · Cần ôn khi tỷ lệ đúng dưới {data.review_threshold}% · Luyện câu sai được thống kê riêng.</p>
    </CardContent></Card>
    <div className="flex flex-wrap items-end justify-between gap-3"><div className="field w-full sm:w-60"><Label htmlFor={id} className="text-xs text-muted-foreground">Hiển thị chủ đề</Label><Select value={filter} onValueChange={value => setFilter(value ?? "all")} items={[{ value: "all", label: "Tất cả chủ đề" }, ...Object.entries(topicStatusLabel).map(([value, label]) => ({ value, label }))]}><SelectTrigger id={id} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả chủ đề</SelectItem>{Object.entries(topicStatusLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button variant="ghost" className="min-h-11 gap-2 text-xs" onClick={() => { setSelectedTopic(undefined); reload(); }}><RefreshCw />Làm mới</Button></div>
    {!topics.length && <EmptyState title={data.topics.length ? "Không có chủ đề trong bộ lọc này" : "Chưa có chủ đề để phân tích"} description={data.topics.length ? "Chọn trạng thái khác để xem các chủ đề còn lại." : "Thêm chủ đề trong môn hoặc tạo quiz từ tài liệu để bắt đầu."} />}
    <div className="min-w-0 space-y-4">{topics.map(topic => <article key={topic.topic_key}><Card className="min-w-0 gap-0 border border-primary/20 py-0 shadow-sm ring-0"><CardContent className="space-y-3 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-5"><div className="min-w-0 space-y-2"><p className={cn("flex items-center gap-1.5 text-xs font-medium", topic.status === "needs_review" ? "text-amber-800" : topic.status === "on_track" ? "text-emerald-700" : "text-muted-foreground")}><span className="size-1.5 shrink-0 rounded-full bg-current" />{topicStatusLabel[topic.status]}</p><h2 className="break-words text-lg font-semibold">{topic.topic}</h2></div><div className="shrink-0 text-right"><p className={cn("text-3xl font-semibold tabular-nums", topic.status === "needs_review" ? "text-amber-800" : topic.status === "on_track" ? "text-emerald-700" : "text-muted-foreground")}>{topic.accuracy === null ? "—" : <>{topic.accuracy}<span className="text-base font-normal">%</span></>}</p><p className="mt-1 max-w-32 text-xs text-muted-foreground">{topic.accuracy === null ? "Chưa có bài đã nộp" : "Tỷ lệ đúng quan sát"}</p></div></div>
      <p className="text-sm leading-relaxed">{topic.reason}</p>
      {topic.available_question_count < data.minimum_questions && <p className="text-sm text-muted-foreground">Hiện có {topic.available_question_count} câu khác nhau trong các quiz có thể truy cập. Cần thêm ít nhất {data.minimum_questions - topic.available_question_count} câu khác nhau; bạn có thể tạo quiz mới từ tài liệu.</p>}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><div><dt className="inline">Đã đánh giá: </dt><dd className="inline font-medium text-foreground">{topic.question_count}/{topic.available_question_count} câu khác nhau</dd></div><div><dt className="sr-only">Kết quả</dt><dd><span className="text-emerald-700">{topic.correct_count} đúng</span> · {topic.wrong_count} sai/bỏ trống</dd></div>{topic.initial_accuracy !== null && <div><dt className="inline">Lần đầu: </dt><dd className="inline">{topic.initial_accuracy}%</dd></div>}{topic.last_assessed_at && <div><dt className="inline">Cập nhật: </dt><dd className="inline">{formatDate(topic.last_assessed_at)}</dd></div>}</dl>
      {topic.practice_answer_count > 0 && <p className="border-l-2 border-primary/25 pl-3 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Luyện câu sai: {topic.practice_correct_count}/{topic.practice_answer_count} câu trả lời đúng.</span> Kết quả này không tăng số câu đánh giá{topic.last_practiced_at ? ` · Gần nhất ${formatDate(topic.last_practiced_at)}` : ""}.</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-primary/10 pt-2">
        {topic.quiz_id && <Link href={`/quizzes/${topic.quiz_id}${topic.status === "insufficient_data" ? "?purpose=diagnostic" : ""}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">{topic.status === "insufficient_data" ? "Làm quiz đầu vào" : "Làm quiz kiểm tra lại"}<ArrowRight className="size-4" /></Link>}
        <Link href={topic.document_id ? `/documents/${topic.document_id}${topic.page_number ? `?page=${topic.page_number}` : ""}` : `/courses/${courseId}?tab=documents`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"><BookOpen className="size-4" />{topic.document_id ? "Đọc nguồn & hỏi đáp" : "Mở tài liệu tạo quiz"}</Link>
        {topic.review_attempt_id && <Link href={`/attempts/${topic.review_attempt_id}`} className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">Xem bài sai gần nhất</Link>}
        <Button variant="link" disabled={!topic.question_count && !topic.practice_answer_count} className="min-h-11 gap-1.5 px-0 text-sm font-normal" onClick={() => setSelectedTopic(topic.topic_key === selectedTopic ? undefined : topic.topic_key)} aria-expanded={selectedTopic === topic.topic_key}><History />{selectedTopic === topic.topic_key ? "Ẩn lịch sử" : "Xem lịch sử"}</Button>
      </div>
      {selectedTopic === topic.topic_key && <TopicHistoryPanel key={topic.topic_key} courseId={courseId} topic={topic.topic_key} />}
    </CardContent></Card></article>)}</div>
  </div>;
}

function TopicHistoryPanel({ courseId, topic }: { courseId: string; topic: string }) {
  const [page, setPage] = useState(0);
  const { data, error, reload } = useResource<TopicHistory[]>(`/courses/${courseId}/learning-analysis/history?topic=${encodeURIComponent(topic)}&limit=11&offset=${page * 10}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <section className="space-y-3 border-t pt-4" aria-label="Lịch sử kết quả theo chủ đề"><p className="text-xs leading-relaxed text-muted-foreground">Kết quả từng lượt của chủ đề này; lượt luyện câu sai không tham gia tỷ lệ đánh giá phía trên.</p>{!data.length && <p className="text-sm text-muted-foreground">Chưa có lịch sử phù hợp.</p>}<div className="divide-y">{data.slice(0, 10).map(item => <div key={item.attempt_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1 basis-56 space-y-1"><p className="break-words text-sm font-medium">{item.quiz_title}</p><p className="text-xs leading-relaxed text-muted-foreground">{purposeLabel[item.purpose]} · {scopeLabel[item.scope]} · {formatDate(item.submitted_at)}</p></div><p className="text-sm tabular-nums">{item.correct_count}/{item.question_count} đúng <span className="text-muted-foreground">· {item.accuracy}%</span></p><Link href={`/attempts/${item.attempt_id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">Xem bài<ArrowRight className="size-3.5" /></Link></div>)}</div><Pagination page={page} hasNext={data.length > 10} onPage={setPage} /></section>;
}
