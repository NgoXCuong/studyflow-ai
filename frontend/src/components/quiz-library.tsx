"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { useState } from "react";
import { ArrowRight, BookOpen, ClipboardList, FileText, Play, RefreshCw } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResource } from "@/hooks/use-resource";
import { formatDate } from "@/lib/api";
import { purposeLabel, scopeLabel, type Attempt } from "@/lib/attempts";
import { difficultyLabels, type QuizListItem } from "@/lib/quizzes";

export function QuizLibrary() {
  const { user } = useUser();
  const [tab, setTab] = useState("all");
  if (user.role === "admin") return <EmptyState title="Trang quiz dành cho sinh viên và giảng viên" description="Bạn có thể quản lý tài khoản và theo dõi hoạt động trong khu vực quản trị." />;
  const teacher = user.role === "teacher";
  const tabs = teacher ? [
    { value: "all", label: "Tất cả quiz" }, { value: "draft", label: "Bản nháp" }, { value: "assigned", label: "Đã giao cho lớp" },
  ] : [
    { value: "all", label: "Tất cả quiz" }, { value: "mine", label: "Quiz của tôi" },
    { value: "assigned", label: "Bài được giao" }, { value: "active", label: "Đang làm" },
  ];
  return <div className="min-w-0 space-y-6">
    <PageHeader icon={ClipboardList} eyebrow={teacher ? "Biên soạn & giao bài" : "Thực hành từ tài liệu"} title={teacher ? "Quiz & giao bài" : "Quiz & luyện tập"} description={teacher ? "Tìm lại bản nháp, duyệt bài giao và xem kết quả trong lớp phụ trách." : "Tiếp tục lượt đang làm, ôn tập từ tài liệu cá nhân hoặc làm bài giảng viên giao."} actions={<Link href="/courses" className={buttonVariants({ variant: "outline", className: "min-h-11" })}><BookOpen />{teacher ? "Chọn tài liệu tạo quiz" : "Tạo quiz từ tài liệu"}<ArrowRight /></Link>} />

    <Tabs value={tab} onValueChange={value => setTab(String(value))} className="min-w-0 gap-6">
      <TabsList variant="line" className="w-full flex-wrap justify-start gap-1 rounded-xl border bg-muted/35 p-1 group-data-horizontal/tabs:h-auto" aria-label="Lọc danh sách quiz">{tabs.map(item => <TabsTrigger key={item.value} value={item.value} className="min-h-12 flex-none px-4">{item.label}</TabsTrigger>)}</TabsList>
      {tabs.map(item => <TabsContent key={item.value} value={item.value}>
        {tab === item.value && (item.value === "active" ? <ActiveAttempts /> : <QuizCollection key={item.value} filter={item.value} teacher={teacher} />)}
      </TabsContent>)}
    </Tabs>
  </div>;
}

function QuizCollection({ filter, teacher }: { filter: string; teacher: boolean }) {
  const [page, setPage] = useState(0);
  const query = filter === "draft" ? "scope=mine&status=draft" : `scope=${filter}`;
  const { data, error, reload } = useResource<QuizListItem[]>(`/quizzes?${query}&limit=13&offset=${page * 12}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{teacher ? "Chỉ hiển thị quiz thuộc quyền quản lý của bạn." : "Chỉ hiển thị quiz và tài liệu bạn còn quyền truy cập."}</p><Button variant="ghost" className="min-h-11" onClick={reload}><RefreshCw />Làm mới</Button></div>
    {!data.length ? <EmptyState title={filter === "assigned" ? "Chưa có quiz giao cho lớp" : filter === "draft" ? "Chưa có bản nháp" : "Chưa có quiz trong danh sách này"} description={teacher ? "Mở tài liệu trong lớp phụ trách để tạo quiz, kiểm tra nội dung và duyệt giao cho lớp." : filter === "assigned" ? "Bài giảng viên giao sẽ xuất hiện khi bạn tham gia lớp và tài liệu nguồn được công bố." : "Mở một tài liệu đã sẵn sàng trong môn học để tạo quiz riêng, hoặc xem các bài được giao trong lớp."} /> : <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {data.slice(0, 12).map(quiz => <Card key={quiz.id} className="min-w-0 rounded-2xl border py-0 shadow-none ring-0 transition-colors hover:border-primary/40"><CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2"><Badge variant={quiz.status === "draft" ? "outline" : "secondary"}>{quiz.status === "draft" ? "Bản nháp" : quiz.classroom_id ? "Đã giao lớp" : "Đã phát hành"}</Badge><Badge variant="outline">{difficultyLabels[quiz.difficulty]} · {quiz.question_count} câu</Badge>{!teacher && <Badge variant="outline">{quiz.is_owner ? "Quiz của tôi" : "Giảng viên giao"}</Badge>}</div>
        <div className="min-w-0 space-y-2"><h2 className="break-words text-lg font-semibold">{quiz.title}</h2><p className="break-words text-sm font-medium text-primary">{quiz.course_title}{quiz.classroom_title ? ` / ${quiz.classroom_title}` : ""}</p><p className="flex items-start gap-2 text-sm text-muted-foreground"><FileText className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{quiz.document_title}</span></p></div>
        <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
          {quiz.status === "draft" ? <Link href={`/documents/${quiz.document_id}`} className={buttonVariants({ className: "min-h-11" })}><ClipboardList />Tiếp tục biên soạn</Link> : teacher ? <Link href={quiz.classroom_id ? `/quizzes/${quiz.id}` : `/documents/${quiz.document_id}`} className={buttonVariants({ className: "min-h-11" })}>{quiz.classroom_id ? "Xem kết quả lớp" : "Xem nội dung quiz"}<ArrowRight /></Link> : <Link href={quiz.active_attempt_id ? `/attempts/${quiz.active_attempt_id}` : `/quizzes/${quiz.id}`} className={buttonVariants({ className: "min-h-11" })}><Play />{quiz.active_attempt_id ? "Tiếp tục làm bài" : "Làm quiz"}</Link>}
          {quiz.status === "published" && <Link href={quiz.is_owner ? `/documents/${quiz.document_id}` : `/quizzes/${quiz.id}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{quiz.is_owner ? "Tài liệu & biên soạn" : "Lịch sử của tôi"}</Link>}
        </div>
      </CardContent></Card>)}
    </div>}
    <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
  </div>;
}

function ActiveAttempts() {
  const [page, setPage] = useState(0);
  const { data, error, reload } = useResource<Attempt[]>(`/attempts/me?status=in_progress&limit=13&offset=${page * 12}`);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <LoadingState />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Các lượt chưa nộp, sắp xếp theo thời điểm bắt đầu gần nhất.</p><Button variant="ghost" className="min-h-11" onClick={reload}><RefreshCw />Làm mới</Button></div>
    {!data.length ? <EmptyState title="Bạn không có lượt làm dở" description="Chọn một quiz cá nhân hoặc bài được giao để bắt đầu. Lựa chọn được lưu sẽ giúp bạn tiếp tục khi quay lại." /> : data.slice(0, 12).map(attempt => <Card key={attempt.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5"><div className="min-w-0 space-y-3"><h2 className="break-words text-lg font-semibold">{attempt.title}</h2><div className="flex flex-wrap gap-2"><Badge variant="secondary">Đang làm</Badge><Badge variant="outline">{purposeLabel[attempt.purpose]}</Badge><Badge variant="outline">{scopeLabel[attempt.scope]}</Badge></div><p className="text-sm text-muted-foreground">Đã lưu {attempt.answered_count}/{attempt.question_count} lựa chọn · Bắt đầu {formatDate(attempt.started_at)}</p></div><Link href={`/attempts/${attempt.id}`} className={buttonVariants({ className: "min-h-11" })}><Play />Tiếp tục làm bài</Link></CardContent></Card>)}
    <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
  </div>;
}
