"use client";

import { toast } from "sonner";

import Link from "next/link";
import { AttemptQuestionCard } from "@/components/attempt-question-card";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Minus, RotateCcw, Save, Send, X } from "lucide-react";
import { ErrorState, Feedback, LoadingState } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";
import { purposeLabel, scopeLabel, type AttemptDetail } from "@/lib/attempts";
import { cn } from "@/lib/utils";

export function QuizAttempt() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return <AttemptContent key={attemptId} attemptId={attemptId} />;
}

function AttemptContent({ attemptId }: { attemptId: string }) {
  const { data, error, reload } = useResource<AttemptDetail>(`/attempts/${attemptId}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <AttemptWorkspace key={data.id} initial={data} />;
}

function AttemptWorkspace({ initial }: { initial: AttemptDetail }) {
  const router = useRouter();
  const { user } = useUser();
  const [attempt, setAttempt] = useState(initial);
  const [selections, setSelections] = useState<Record<string, number | null>>(() => Object.fromEntries(initial.questions.map(q => [q.id, q.selected_index])));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitted = attempt.status === "submitted";
  const dirty = attempt.questions.filter(q => selections[q.id] !== q.selected_index);
  const answered = attempt.questions.filter(q => selections[q.id] !== null).length;

  async function choose(questionId: string, value: number | null) {
    if (pending) return;
    setSelections(current => ({ ...current, [questionId]: value }));
    setPending(true); setError("");
    try {
      setAttempt(await api<AttemptDetail>(`/attempts/${attempt.id}/answers/${questionId}`, { method: "PUT", body: JSON.stringify({ selected_index: value }) }));
      toast.success("Đã lưu lựa chọn.");
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function saveSelections() {
    for (const question of dirty) {
      const saved = await api<AttemptDetail>(`/attempts/${attempt.id}/answers/${question.id}`, { method: "PUT", body: JSON.stringify({ selected_index: selections[question.id] }) });
      setAttempt(saved);
    }
  }
  async function save() {
    if (pending) return;
    setPending(true); setError("");
    try { await saveSelections(); toast.success("Đã lưu tất cả lựa chọn."); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function submit() {
    setPending(true); setError("");
    try {
      await saveSelections();
      setAttempt(await api<AttemptDetail>(`/attempts/${attempt.id}/submit`, { method: "POST" }));
    } finally { setPending(false); }
  }
  async function retry(scope: "full" | "wrong_only") {
    if (pending) return;
    setPending(true); setError("");
    try {
      const next = await api<AttemptDetail>(`/quizzes/${attempt.quiz_id}/attempts`, { method: "POST", body: JSON.stringify({ scope, purpose: attempt.purpose, source_attempt_id: attempt.id }) });
      router.push(`/attempts/${next.id}`);
    } catch (err) { setError(errorMessage(err)); setPending(false); }
  }

  return <div className="min-w-0 space-y-5">
    <Link href={`/quizzes/${attempt.quiz_id}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4" />{user.role === "teacher" ? "Về kết quả lớp" : "Về quiz và lịch sử"}</Link>
    <header className="space-y-3 rounded-2xl border bg-muted/35 p-5 sm:p-7"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{submitted ? "Đã nộp" : "Đang làm"}</Badge><Badge variant="outline">{purposeLabel[attempt.purpose]}</Badge><Badge variant="outline">{scopeLabel[attempt.scope]}</Badge></div><h1 className="page-heading break-words">{attempt.title}</h1>
      {submitted ? <p className="text-lg font-semibold">{attempt.score?.toFixed(2)}/10 · {attempt.correct_count}/{attempt.question_count} câu đúng · {attempt.question_count - attempt.answered_count} câu bỏ trống</p> : <p className="text-sm text-muted-foreground">Đã chọn {answered}/{attempt.question_count} câu. {dirty.length ? "Có lựa chọn chưa lưu; hãy thử lưu lại trước khi rời trang." : "Các lựa chọn đã được lưu trên hệ thống."}</p>}
    </header>
    <Feedback error={error} />
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
    <div className="min-w-0 space-y-5">{attempt.questions.map((question, index) => <AttemptQuestionCard key={question.id} question={question} index={index} submitted={submitted} selectedIndex={selections[question.id]} pending={pending} onSelect={choose} />)}</div>
    <aside className="order-first rounded-2xl border bg-muted/35 p-5 xl:sticky xl:top-28 xl:order-last" aria-label="Điều hướng câu hỏi">
      <h2 className="font-semibold">{submitted ? "Xem lại bài làm" : "Tiến độ bài làm"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{submitted ? `${attempt.correct_count}/${attempt.question_count} câu đúng` : `${answered}/${attempt.question_count} câu đã chọn`}</p>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Đến câu hỏi">{attempt.questions.map((question, index) => <Button key={question.id} render={<a href={`#attempt-question-${question.id}`} />} nativeButton={false} variant="outline" className={cn("min-h-11 min-w-11 gap-1.5", submitted ? question.is_correct ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800" : question.selected_index !== null ? "border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive" : "bg-muted text-muted-foreground" : selections[question.id] !== null && "bg-secondary")} aria-label={`Câu ${index + 1}: ${submitted ? question.is_correct ? "đúng" : question.selected_index === null ? "bỏ trống" : "sai" : selections[question.id] !== null ? "đã chọn" : "chưa chọn"}`}>{index + 1}{submitted && (question.is_correct ? <Check aria-hidden="true" /> : question.selected_index === null ? <Minus aria-hidden="true" /> : <X aria-hidden="true" />)}</Button>)}</nav>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{submitted ? "Chọn số câu để xem lại đáp án và nguồn giải thích." : "Lựa chọn được lưu sau mỗi lần chọn. Bạn có thể quay lại bất kỳ câu nào trước khi nộp."}</p>
    </aside></div>
    {!submitted ? <fieldset disabled={pending} className="flex min-w-0 flex-wrap justify-end gap-3"><Button variant="outline" className="min-h-11" disabled={pending || !dirty.length} onClick={save}>{pending ? <LoaderCircle className="animate-spin" /> : <Save />}Lưu lựa chọn chưa lưu</Button><ConfirmAction label="Nộp bài" icon={<Send />} variant="outline" confirmVariant="default" title="Nộp bài để chấm điểm?" description={`Bạn đã chọn ${answered}/${attempt.question_count} câu. Còn ${attempt.question_count - answered} câu bỏ trống. Sau khi nộp không thể sửa lượt làm này.`} action={submit} onDone={() => toast.success("Đã nộp và chấm bài.")} /></fieldset> : user.role === "student" && <div className="flex flex-wrap gap-3"><Button disabled={pending} className="min-h-11" onClick={() => retry("full")}><RotateCcw />Làm lại toàn bộ</Button><Button variant="outline" disabled={pending || attempt.correct_count === attempt.question_count} className="min-h-11" onClick={() => retry("wrong_only")}>Luyện câu sai và bỏ trống</Button></div>}
  </div>;
}
