"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, GraduationCap, LockKeyhole } from "lucide-react";
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

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">Không gian kiến thức</p>
        <h1 className="page-heading">Môn học của bạn</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user.role === "teacher"
            ? "Sắp xếp nội dung giảng dạy và quản lý các lớp phụ trách."
            : "Quản lý môn cá nhân và nội dung học từ các lớp đang tham gia."}
        </p>
      </div>
      {editableRole && <CourseEditor role={editableRole} onSaved={() => {
        if (page !== 0) setPage(0);
        else reload();
      }} />}
    </div>

    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length ? <EmptyState
        title={page === 0 ? "Bắt đầu với môn học đầu tiên" : "Không còn môn học ở trang này"}
        description={user.role === "teacher"
          ? "Tạo môn giảng dạy để tổ chức chương, chủ đề và các lớp học của bạn."
          : "Tạo môn cá nhân hoặc tham gia một lớp học. Môn học được phép truy cập sẽ xuất hiện tại đây."}
      >
        {user.role === "student" && <Link href="/classrooms" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Tham gia lớp học<ArrowRight />
        </Link>}
      </EmptyState> : <div className="space-y-3">
        {data.slice(0, 12).map(course => <Card key={course.id} className="group border py-0 shadow-none transition-colors hover:border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${course.kind === "personal" ? "bg-accent text-primary" : "bg-amber-50 text-amber-800"}`}>
              {course.kind === "personal" ? <BookOpen className="size-5" /> : <GraduationCap className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
              <h2 className="text-lg leading-snug font-semibold break-words">
                <Link href={`/courses/${course.id}`} className="hover:text-primary">{course.title}</Link>
              </h2>
              {course.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5 shrink-0" />
                {course.owner_id === user.id ? "Bạn quản lý môn học này" : "Truy cập qua lớp đang tham gia"}
              </p>
            </div>
            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
              <Badge variant="secondary">{course.kind === "personal" ? "Cá nhân" : "Giảng dạy"}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(course.created_at)}</span>
            </div>
            <Link href={`/courses/${course.id}`} className={buttonVariants({ variant: "outline", className: "ml-auto h-10" })}>
              Mở môn học<ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </CardContent>
        </Card>)}
      </div>}
      <Pagination page={page} hasNext={data.length > 12} onPage={setPage} />
    </>}
  </div>;
}