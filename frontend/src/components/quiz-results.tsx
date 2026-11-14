"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { formatDate } from "@/lib/api";
import { purposeLabel, scopeLabel, type QuizStatistics, type StudentAttempt } from "@/lib/attempts";

export function QuizResults({ quizId }: { quizId: string }) {
  const [page, setPage] = useState(0);
  const results = useResource<StudentAttempt[]>(`/quizzes/${quizId}/results?limit=21&offset=${page * 20}`);
  const stats = useResource<QuizStatistics>(`/quizzes/${quizId}/statistics`);
  if (results.error || stats.error) return <ErrorState message={results.error ?? stats.error ?? "Không đọc được kết quả."} retry={() => { results.reload(); stats.reload(); }} />;
  if (!results.data || !stats.data) return <LoadingState />;
  return <div className="min-w-0 space-y-5">
    <Link href="/quizzes" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Quiz & giao bài</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2"><h1 className="page-heading">Kết quả quiz lớp</h1><p className="text-sm leading-relaxed text-muted-foreground">Theo dõi bài đã nộp và những câu hỏi sinh viên còn gặp khó khăn.</p></div><Button variant="ghost" className="min-h-11 gap-2" onClick={() => { results.reload(); stats.reload(); }}><RefreshCw />Làm mới</Button></header>
    <Card className="gap-0 border border-primary/20 bg-muted/20 py-0 shadow-sm ring-0"><CardContent className="space-y-4 p-4 sm:p-6">
      <dl className="grid grid-cols-3 divide-x divide-primary/15">{[{ label: "Lượt đã nộp", value: stats.data.submitted_count }, { label: "Sinh viên đã nộp", value: stats.data.student_count }, { label: "Điểm trung bình", value: stats.data.average_score === null ? "—" : stats.data.average_score.toFixed(2) }].map((item, index) => <div key={item.label} className={index ? "min-w-0 space-y-2 pl-3 sm:pl-6" : "min-w-0 space-y-2 pr-2"}><dt className="text-xs leading-relaxed text-muted-foreground">{item.label}</dt><dd className="text-2xl font-semibold tabular-nums sm:text-3xl">{item.value}{index === 2 && stats.data!.average_score !== null && <span className="ml-1 text-sm font-normal text-muted-foreground">/10</span>}</dd></div>)}</dl>
      <p className="border-t border-primary/10 pt-3 text-xs leading-relaxed text-muted-foreground">Chỉ tính lượt đã nộp, gồm cả làm lại và luyện câu sai. Điểm trung bình tính theo từng lượt, không phải từng sinh viên.</p>
    </CardContent></Card>
    <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card className="min-w-0 gap-0 border border-primary/20 py-0 shadow-sm ring-0"><CardContent className="min-w-0 p-0">
        <div className="flex items-start justify-between gap-3 border-b px-4 py-5 sm:px-5"><div className="space-y-1"><h2 className="font-semibold">Lượt làm của sinh viên</h2><p className="text-xs leading-relaxed text-muted-foreground">Mỗi dòng là một lượt nộp, gồm cả lượt làm lại.</p></div><Users className="mt-0.5 size-5 shrink-0 text-primary" /></div>
        {!results.data.length ? <p className="p-5 text-sm text-muted-foreground">Chưa có bài đã nộp.</p> : <Table><TableHeader><TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead className="pl-4 sm:pl-5">Sinh viên / lượt làm</TableHead><TableHead className="text-right">Điểm</TableHead><TableHead>Ngày nộp</TableHead><TableHead className="pr-4 sm:pr-5"><span className="sr-only">Xem bài đã nộp</span></TableHead></TableRow></TableHeader><TableBody>{results.data.slice(0, 20).map(attempt => <TableRow key={attempt.id}>
          <TableCell className="min-w-48 max-w-sm space-y-1 whitespace-normal py-4 pl-4 sm:pl-5"><p className="break-words font-semibold">{attempt.student_name}</p><p className="break-words text-xs text-muted-foreground">{attempt.title}</p><p className="text-xs leading-relaxed text-muted-foreground">{purposeLabel[attempt.purpose]} · {scopeLabel[attempt.scope]}</p></TableCell>
          <TableCell className="text-right align-top pt-4"><p className="font-semibold tabular-nums text-primary">{attempt.score === null ? "—" : <>{attempt.score.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/10</span></>}</p><p className="mt-1 text-xs text-muted-foreground">{attempt.correct_count ?? "—"}/{attempt.question_count} đúng</p></TableCell>
          <TableCell className="align-top pt-4 text-xs text-muted-foreground">{attempt.submitted_at ? formatDate(attempt.submitted_at) : "—"}</TableCell>
          <TableCell className="pr-4 text-right align-top sm:pr-5"><Link href={`/attempts/${attempt.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline" aria-label={`Xem bài đã nộp của ${attempt.student_name}`}>Xem bài<ArrowUpRight className="size-4" /></Link></TableCell>
        </TableRow>)}</TableBody></Table>}
        <div className="px-4 py-3 sm:px-5"><Pagination page={page} hasNext={results.data.length > 20} onPage={setPage} /></div>
      </CardContent></Card>
      <Card className="min-w-0 gap-0 border border-primary/20 py-0 shadow-sm ring-0"><CardContent className="p-0">
        <div className="space-y-1 border-b px-4 py-5 sm:px-5"><h2 className="font-semibold">Kết quả theo câu hỏi</h2><p className="text-xs leading-relaxed text-muted-foreground">Xếp theo số lượt sai giảm dần, gồm cả câu bỏ trống.</p></div>
        {!stats.data.questions.length && <p className="p-5 text-sm text-muted-foreground">Chưa có dữ liệu câu hỏi.</p>}
        <div className="divide-y px-4 sm:px-5">{[...stats.data.questions].sort((a, b) => b.wrong_count - a.wrong_count).map(question => <article key={question.question_id} className="space-y-3 py-4">
          <div className="space-y-1.5"><p className="break-words text-xs text-muted-foreground">{question.topic}</p><h3 className="whitespace-pre-wrap break-words text-sm font-medium leading-6">{question.question}</h3></div>
          {question.attempt_count > 0 && <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${question.correct_count} đúng, ${question.wrong_count} sai trên ${question.attempt_count} lần làm`} role="img"><span className="bg-emerald-500" style={{ width: `${question.correct_count / question.attempt_count * 100}%` }} /><span className="bg-amber-400" style={{ width: `${question.wrong_count / question.attempt_count * 100}%` }} /></div>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span className="inline-flex items-center gap-1 text-emerald-700"><Check className="size-3.5" />{question.correct_count} đúng</span><span className="text-amber-800">{question.wrong_count} sai <span className="text-muted-foreground">(gồm {question.skipped_count} bỏ trống)</span></span><span className="text-muted-foreground">{question.attempt_count} lần làm</span></div>
        </article>)}</div>
      </CardContent></Card>
    </div>
  </div>;
}
