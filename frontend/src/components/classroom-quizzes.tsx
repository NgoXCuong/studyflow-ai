"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResource } from "@/hooks/use-resource";
import { formatDate } from "@/lib/api";
import { difficultyLabels, type Quiz } from "@/lib/quizzes";

export function ClassroomQuizzes({ classroomId, canManage }: { classroomId: string; canManage: boolean }) {
  const [page, setPage] = useState(0);
  const { data, error, reload } = useResource<Quiz[]>(`/classrooms/${classroomId}/quizzes?limit=13&offset=${page * 12}`);
  return <section className="min-w-0 space-y-4" aria-label="Quiz đã giao cho lớp">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Quiz đã giao</h2><p className="mt-1 text-sm text-muted-foreground">{canManage ? "Quiz bạn đã duyệt và giao cho lớp. Mở tài liệu nguồn để xem hoặc tạo bản sao nháp." : "Các quiz đã được giảng viên kiểm tra và giao cho lớp."}</p></div><Button variant="outline" className="min-h-11" onClick={reload}>Làm mới</Button></div>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Chưa có quiz được giao cho lớp.</p>}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">{data.slice(0, 12).map(quiz => <Card key={quiz.id} className="min-w-0"><CardContent className="space-y-3 p-5 sm:p-6">
        <Badge variant="secondary">Đã duyệt và giao lớp</Badge><h3 className="break-words font-semibold">{quiz.title}</h3>
        <p className="text-sm text-muted-foreground">{difficultyLabels[quiz.difficulty]} · Giao ngày {quiz.published_at && formatDate(quiz.published_at)}</p>
        <div className="flex flex-wrap gap-2"><Link href={`/quizzes/${quiz.id}`} className={buttonVariants({ className: "min-h-11" })}>{canManage ? "Xem kết quả lớp" : "Làm quiz"}</Link><Link href={`/documents/${quiz.document_id}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{canManage ? "Quản lý quiz trong tài liệu" : "Xem tài liệu nguồn"}</Link></div>
      </CardContent></Card>)}</div>
      <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
    </>}
  </section>;
}
