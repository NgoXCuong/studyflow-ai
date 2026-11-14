"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { ArrowLeft, LoaderCircle, Play, ClipboardList } from "lucide-react";
import { ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { QuizResults } from "@/components/quiz-results";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage, formatDate } from "@/lib/api";
import { purposeLabel, scopeLabel, type Attempt, type AttemptDetail } from "@/lib/attempts";
import { difficultyLabels, type Quiz } from "@/lib/quizzes";

export function QuizPractice() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useUser();
  if (user.role === "teacher") return <QuizResults key={quizId} quizId={quizId} />;
  if (user.role !== "student") return <p>Bạn không có quyền làm quiz.</p>;
  return <QuizLobby key={quizId} quizId={quizId} />;
}

function QuizLobby({ quizId }: { quizId: string }) {
  const searchParams = useSearchParams();
  const initialPurpose = searchParams.get("purpose") === "diagnostic" ? "diagnostic" : "practice";
  const { data: quiz, error, reload } = useResource<Quiz>(`/quizzes/${quizId}/practice`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!quiz) return <LoadingState />;
  return <div className="min-w-0 space-y-6">
    <Link href={quiz.classroom_id ? `/classrooms/${quiz.classroom_id}` : `/documents/${quiz.document_id}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4" />Về {quiz.classroom_id ? "lớp học" : "tài liệu"}</Link>
    <PageHeader icon={ClipboardList} eyebrow={<span className="flex flex-wrap gap-2"><Badge variant="secondary">{quiz.classroom_id ? "Quiz giảng viên giao" : "Quiz cá nhân"}</Badge><Badge variant="outline">{difficultyLabels[quiz.difficulty]}</Badge></span>} title={quiz.title} description="Mỗi câu có một đáp án đúng. Chấm theo thang 10, trọng số bằng nhau; sai hoặc bỏ trống không trừ điểm. Đáp án và giải thích hiển thị sau khi nộp." />
    <AttemptHistory key={initialPurpose} quizId={quizId} initialPurpose={initialPurpose} />
  </div>;
}

function AttemptHistory({ quizId, initialPurpose }: { quizId: string; initialPurpose: Attempt["purpose"] }) {
  const router = useRouter();
  const id = useId();
  const [page, setPage] = useState(0);
  const [purpose, setPurpose] = useState<Attempt["purpose"]>(initialPurpose);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const { data, error, reload } = useResource<Attempt[]>(`/quizzes/${quizId}/attempts/me?limit=13&offset=${page * 12}`);
  async function start() {
    if (pending) return;
    setPending(true); setActionError("");
    try {
      const attempt = await api<AttemptDetail>(`/quizzes/${quizId}/attempts`, { method: "POST", body: JSON.stringify({ purpose }) });
      router.push(`/attempts/${attempt.id}`);
    } catch (err) { setActionError(errorMessage(err)); setPending(false); }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  const active = data.find(attempt => attempt.status === "in_progress");
  return <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
    <Card className="min-w-0 rounded-2xl border bg-accent/35 py-0 shadow-none ring-0 xl:sticky xl:top-28"><CardContent className="space-y-4 p-5">{active ? <><h2 className="text-lg font-semibold">Bạn có lượt làm chưa nộp</h2><Link href={`/attempts/${active.id}`} className={buttonVariants({ className: "min-h-11" })}><Play />Tiếp tục làm bài</Link></> : <>
      <h2 className="text-lg font-semibold">Bắt đầu lượt mới</h2><div className="flex flex-wrap items-end gap-3"><div className="field w-full sm:w-64"><Label htmlFor={id}>Mục đích</Label><Select value={purpose} onValueChange={value => setPurpose(value === "diagnostic" ? "diagnostic" : "practice")} items={Object.entries(purposeLabel).map(([value, label]) => ({ value, label }))} disabled={pending}><SelectTrigger id={id} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(purposeLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button onClick={start} disabled={pending} className="min-h-11">{pending ? <LoaderCircle className="animate-spin" /> : <Play />}Bắt đầu làm bài</Button></div><p className="text-sm text-muted-foreground">Có thể làm lại nhiều lần. Mỗi lượt được lưu riêng; kiểm tra đầu vào sử dụng cùng bộ câu hỏi để ghi nhận kết quả theo chủ đề.</p>
    </>}<Feedback error={actionError} /></CardContent></Card>
    <section className="min-w-0 space-y-4" aria-label="Lịch sử làm quiz"><h2 className="text-lg font-semibold">Lịch sử của bạn</h2>{!data.length && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Bạn chưa làm quiz này.</p>}
      {data.slice(0, 12).map(attempt => <Card key={attempt.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5"><div className="min-w-0 space-y-2"><div className="flex flex-wrap gap-2"><Badge variant="outline">{purposeLabel[attempt.purpose]}</Badge><Badge variant="outline">{scopeLabel[attempt.scope]}</Badge><Badge variant="secondary">{attempt.status === "submitted" ? "Đã nộp" : "Đang làm"}</Badge></div><p className="text-sm text-muted-foreground">{formatDate(attempt.started_at)} · {attempt.question_count} câu{attempt.source_attempt_id ? " · Làm lại từ lượt trước" : ""}</p>{attempt.score !== null && <p className="font-semibold">{attempt.score.toFixed(2)}/10 · {attempt.correct_count}/{attempt.question_count} câu đúng</p>}</div><Link href={`/attempts/${attempt.id}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{attempt.status === "submitted" ? "Xem kết quả" : "Tiếp tục"}</Link></CardContent></Card>)}
      <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
    </section>
  </div>;
}
