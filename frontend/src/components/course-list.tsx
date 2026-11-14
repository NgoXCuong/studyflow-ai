"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, FileText, GraduationCap, Layers3, LockKeyhole, MessageCircle, Users } from "lucide-react";
import { CourseEditor } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResource } from "@/hooks/use-resource";
import { formatDate } from "@/lib/api";
import type { Course } from "@/lib/courses";

export default function CoursesPage() {
  const { user } = useUser();
  const [page, setPage] = useState(0);
  const { data, error, reload } = useResource<Course[]>(`/courses?limit=13&offset=${page * 12}`);
  const editableRole = user.role === "student" || user.role === "teacher" ? user.role : null;

  return <div className="mx-auto max-w-7xl space-y-8">
    <header className="relative isolate overflow-hidden rounded-3xl bg-foreground text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.35fr_0.65fr] lg:p-10">
        <div className="max-w-xl">
          <p className="mb-5 flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.16em] text-teal-200 uppercase"><span className="size-1.5 rounded-full bg-teal-200" />Không gian kiến thức</p>
          <h1 className="text-3xl leading-[1.2] font-semibold tracking-tight sm:text-4xl">Môn học của bạn.<span className="mt-1 block text-white/65">Kiến thức, có tổ chức.</span></h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-white/75">{user.role === "teacher" ? "Từ một môn học đến những lớp học kết nối. Sắp xếp tài liệu và xây dựng hành trình học tập cho sinh viên." : "Mỗi môn học là một góc tập trung. Mang tài liệu vào, đặt câu hỏi và biến những điều chưa rõ thành kiến thức của riêng bạn."}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {editableRole && <div className="[&_button]:min-h-11 [&_button]:bg-white [&_button]:px-5 [&_button]:text-foreground [&_button]:hover:bg-white/90"><CourseEditor role={editableRole} onSaved={() => { if (page !== 0) setPage(0); else reload(); }} /></div>}
            {user.role !== "admin" && <Link href="/classrooms" className={buttonVariants({ variant: "outline", className: "min-h-11 border-white/25 bg-transparent px-4 text-white hover:bg-white/10 hover:text-white" })}><Users />{user.role === "teacher" ? "Lớp phụ trách" : "Lớp học của tôi"}<ArrowUpRight /></Link>}
          </div>
        </div>
        <div aria-hidden="true" className="relative hidden min-h-56 items-center justify-center lg:flex">
          <div className="absolute h-48 w-44 rotate-12 rounded-xl border border-white/20 bg-white/5" />
          <div className="absolute h-48 w-44 -rotate-6 rounded-xl border border-white/25 bg-white/10" />
          <div className="relative w-44 rotate-3 rounded-xl border border-white/40 bg-accent px-5 py-6 text-foreground shadow-2xl shadow-black/15">
            <div className="mb-8 flex items-center justify-between"><BookOpen className="size-6 text-primary" /><span className="text-[9px] font-semibold tracking-[0.15em] text-primary">STUDYFLOW</span></div>
            <p className="text-xl leading-snug font-semibold">Từng trang nhỏ.<br />Hiểu sâu hơn.</p>
            <div className="mt-6 space-y-2"><div className="h-px w-full bg-primary/20" /><div className="h-px w-3/4 bg-primary/20" /></div>
            <p className="mt-4 text-[9px] tracking-wide text-primary">TÀI LIỆU LÀ ĐIỂM BẮT ĐẦU</p>
          </div>
        </div>
      </div>
      <div className="relative flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 px-6 py-4 text-xs text-white/75 sm:px-9 lg:px-10"><span className="inline-flex items-center gap-2"><FileText className="size-4 text-teal-200" />Tài liệu có chỗ</span><span className="inline-flex items-center gap-2"><MessageCircle className="size-4 text-teal-200" />Câu trả lời có nguồn</span><span className="inline-flex items-center gap-2"><Layers3 className="size-4 text-teal-200" />Việc học liền mạch</span></div>
    </header>

    <section className="space-y-5" aria-labelledby="course-collection-heading">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Bộ sưu tập học tập</p><h2 id="course-collection-heading" className="text-xl font-semibold">Chọn một môn. Bắt đầu tập trung.</h2></div>{data && !error && <p className="text-sm text-muted-foreground">{Math.min(data.length, 12)} môn trong trang {page + 1}</p>}</div>
      {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
        {!data.length ? <EmptyState title={page === 0 ? "Môn học đầu tiên bắt đầu từ bạn" : "Không còn môn học ở trang này"} description={user.role === "teacher" ? "Tạo môn giảng dạy để tổ chức chương, chủ đề và các lớp học của bạn." : "Tạo một môn cá nhân hoặc tham gia lớp học. Những môn bạn có quyền truy cập sẽ xuất hiện tại đây."}>
          {user.role === "student" && <Link href="/classrooms" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>Tham gia lớp học<ArrowRight /></Link>}
        </EmptyState> : <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.slice(0, 12).map((course, index) => <Card key={course.id} className="group min-w-0 gap-0 rounded-2xl border py-0 shadow-none ring-0 transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5">
            <div className={`relative flex h-28 items-center justify-between overflow-hidden border-b px-6 ${course.kind === "personal" ? "bg-accent/60" : "bg-amber-50/80"}`}>
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${course.kind === "personal" ? "bg-primary" : "bg-amber-700"}`} />
              <span className={`flex size-12 items-center justify-center rounded-xl border bg-card ${course.kind === "personal" ? "border-primary/15 text-primary" : "border-amber-900/10 text-amber-800"}`}>{course.kind === "personal" ? <BookOpen className="size-6" /> : <GraduationCap className="size-6" />}</span>
              <span aria-hidden="true" className={`text-6xl font-light tracking-tighter ${course.kind === "personal" ? "text-primary/15" : "text-amber-900/15"}`}>{String(page * 12 + index + 1).padStart(2, "0")}</span>
            </div>
            <CardContent className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className="bg-background/60">{course.kind === "personal" ? "Cá nhân" : user.role === "student" ? "Môn lớp" : "Giảng dạy"}</Badge><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{formatDate(course.created_at)}</span></div>
              <div className="min-w-0"><h3 className="text-xl leading-snug font-semibold break-words"><Link href={`/courses/${course.id}`} className="transition-colors hover:text-primary">{course.title}</Link></h3><p className="mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-muted-foreground">{course.description || "Mở môn học để khám phá các chương, chủ đề và tài liệu trong không gian này."}</p></div>
              <div className="mt-auto space-y-4 border-t pt-4"><p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />{course.owner_id === user.id ? "Không gian do bạn quản lý" : "Truy cập qua lớp đang tham gia"}</p><Link href={`/courses/${course.id}`} className={buttonVariants({ variant: "outline", className: "min-h-11 w-full justify-between bg-card px-4 group-hover:border-primary/30 group-hover:bg-accent/50 group-hover:text-primary" })}>Mở môn học<ArrowUpRight className="size-4" /></Link></div>
            </CardContent>
          </Card>)}
        </div>}
        <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
      </>}
    </section>
  </div>;
}
