"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, FileText, Hash, Layers3, Users } from "lucide-react";
import { ChapterEditor, ClassroomEditor, ConfirmAction, CourseEditor, TopicEditor } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { listAll, type Chapter, type Classroom, type Course, type Topic } from "@/lib/courses";
import { useResource } from "@/hooks/use-resource";
import { DocumentList } from "@/components/document-list";

export function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  return <CourseContent key={courseId} courseId={courseId} />;
}

function CourseContent({ courseId }: { courseId: string }) {
  const { user } = useUser();
  const router = useRouter();
  const { data: course, error, reload } = useResource<Course>(`/courses/${courseId}`);
  const [content, setContent] = useState<{ chapters: Chapter[]; topics: Topic[]; classrooms: Classroom[] }>();
  const [contentError, setContentError] = useState("");
  const [revision, setRevision] = useState(0);
  const [chapterFilter, setChapterFilter] = useState("all");
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "documents" ? "documents" : "curriculum");
  const canEdit = !!course && course.owner_id === user.id && (course.kind === "personal" || user.role === "teacher");

  useEffect(() => {
    if (!course) return;
    const controller = new AbortController();
    Promise.all([
      listAll<Chapter>(`/courses/${courseId}/chapters`, controller.signal),
      listAll<Topic>(`/courses/${courseId}/topics`, controller.signal),
      listAll<Classroom>(`/classrooms?course_id=${courseId}`, controller.signal),
    ]).then(([chapters, topics, classrooms]) => {
      if (!controller.signal.aborted) { setContent({ chapters, topics, classrooms }); setContentError(""); }
    }, err => { if (!controller.signal.aborted) setContentError(errorMessage(err)); });
    return () => controller.abort();
  }, [course, courseId, revision]);

  function reloadContent() { setContent(undefined); setContentError(""); setRevision(value => value + 1); }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!course) return <LoadingState />;
  const topics = content?.topics.filter(topic => chapterFilter === "all" || (chapterFilter === "none" ? topic.chapter_id === null : topic.chapter_id === chapterFilter)) ?? [];

  return <div className="space-y-7"><Link href="/courses" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Tất cả môn học</Link>
    <div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 max-w-3xl"><div className="mb-3 flex items-center gap-2"><Badge variant="secondary">{course.kind === "personal" ? "Môn cá nhân" : "Môn giảng dạy"}</Badge><span className="text-xs text-muted-foreground">{canEdit ? "Bạn quản lý" : "Nội dung qua lớp học"}</span></div><h1 className="page-heading break-words">{course.title}</h1><p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{course.description || "Tổ chức chương và chủ đề để xây dựng nền tảng kiến thức rõ ràng."}</p></div>{canEdit && (user.role === "student" || user.role === "teacher") && <div className="flex flex-wrap gap-2"><CourseEditor course={course} role={user.role} onSaved={reload} /><ConfirmAction title="Xóa môn học?" description={`Môn “${course.title}” và nội dung liên quan sẽ không còn truy cập được qua môn học này.`} action={() => api(`/courses/${courseId}`, { method: "DELETE" })} onDone={() => router.push("/courses")} /></div>}</div>
    {contentError ? <ErrorState message={contentError} retry={reloadContent} /> : !content ? <LoadingState /> : <Tabs value={activeTab} onValueChange={value => setActiveTab(String(value))} className="gap-6">
      <TabsList className="h-11 max-w-full"><TabsTrigger value="curriculum" className="px-3"><Layers3 /><span className="sm:hidden">Nội dung</span><span className="hidden sm:inline">Nội dung môn học</span></TabsTrigger><TabsTrigger value="documents" className="px-3"><FileText />Tài liệu</TabsTrigger>{course.kind === "teaching" && <TabsTrigger value="classrooms" className="px-3"><Users />Lớp học<span className="hidden sm:inline">({content.classrooms.length})</span></TabsTrigger>}</TabsList>
      <TabsContent value="documents"><DocumentList course={course} chapters={content.chapters} classrooms={content.classrooms} /></TabsContent>
      <TabsContent value="curriculum"><div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="border shadow-none py-0"><CardContent className="p-5"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-semibold">Chương học</h2><Badge variant="outline">{content.chapters.length}</Badge></div><nav aria-label="Lọc chủ đề theo chương" className="space-y-2"><ChapterFilter active={chapterFilter === "all"} onClick={() => setChapterFilter("all")} label="Tất cả chủ đề" count={content.topics.length} />{content.chapters.map(chapter => <ChapterFilter key={chapter.id} active={chapterFilter === chapter.id} onClick={() => setChapterFilter(chapter.id)} label={chapter.title} count={content.topics.filter(topic => topic.chapter_id === chapter.id).length} />)}<ChapterFilter active={chapterFilter === "none"} onClick={() => setChapterFilter("none")} label="Không thuộc chương" count={content.topics.filter(topic => topic.chapter_id === null).length} /></nav>{canEdit && <div className="mt-5 border-t pt-5"><ChapterEditor courseId={courseId} onSaved={reloadContent} /></div>}</CardContent></Card>
        <section className="min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{chapterFilter === "all" ? "Tất cả chủ đề" : chapterFilter === "none" ? "Chủ đề độc lập" : content.chapters.find(c => c.id === chapterFilter)?.title}</h2><p className="mt-1 text-sm text-muted-foreground">{topics.length} chủ đề trong phạm vi đang xem</p></div>{canEdit && <TopicEditor courseId={courseId} chapters={content.chapters} onSaved={reloadContent} />}</div>
          {topics.length ? topics.map(topic => <Card key={topic.id} className="border shadow-none py-0"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Hash className="size-5" /></span><div className="min-w-0 flex-1"><p className="mb-1 text-xs text-muted-foreground">{content.chapters.find(chapter => chapter.id === topic.chapter_id)?.title ?? "Không thuộc chương"}</p><h3 className="text-base font-semibold break-words">{topic.title}</h3>{topic.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{topic.description}</p>}{canEdit && <div className="mt-4 flex flex-wrap gap-2"><TopicEditor courseId={courseId} topic={topic} chapters={content.chapters} onSaved={reloadContent} /><ConfirmAction title="Xóa chủ đề?" description={`Chủ đề “${topic.title}” sẽ bị xóa khỏi môn học.`} action={() => api(`/courses/${courseId}/topics/${topic.id}`, { method: "DELETE" })} onDone={reloadContent} /></div>}</div></CardContent></Card>) : <EmptyState title="Chưa có chủ đề trong mục này" description={canEdit ? "Thêm chủ đề để bắt đầu tổ chức kiến thức cho môn học." : "Chủ đề sẽ xuất hiện khi giảng viên bổ sung nội dung."} />}
          {canEdit && content.chapters.length > 0 && <section className="space-y-3 pt-5"><h2 className="text-lg font-semibold">Quản lý chương</h2><p className="text-sm text-muted-foreground">Chuyển các chủ đề và tài liệu ra khỏi chương trước khi xóa.</p>{content.chapters.map(chapter => <div key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div className="min-w-0"><p className="font-medium break-words">{chapter.title}</p><p className="text-xs text-muted-foreground">Thứ tự: {chapter.position}</p></div><div className="flex flex-wrap gap-2"><ChapterEditor courseId={courseId} chapter={chapter} onSaved={reloadContent} /><ConfirmAction title="Xóa chương?" description={`Chương “${chapter.title}” chỉ có thể xóa khi không còn chủ đề hoặc tài liệu tham chiếu.`} action={() => api(`/courses/${courseId}/chapters/${chapter.id}`, { method: "DELETE" })} onDone={() => { setChapterFilter("all"); reloadContent(); }} /></div></div>)}</section>}
        </section>
      </div></TabsContent>
      {course.kind === "teaching" && <TabsContent value="classrooms"><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Lớp học trong môn</h2><p className="mt-1 text-sm text-muted-foreground">{canEdit ? "Các lớp phụ trách thuộc môn giảng dạy này." : "Chỉ hiển thị các lớp bạn đang tham gia."}</p></div>{canEdit && user.role === "teacher" && <ClassroomEditor courseId={courseId} onSaved={reloadContent} />}</div>{content.classrooms.length ? <div className="grid gap-5 sm:grid-cols-2">{content.classrooms.map(classroom => <Link key={classroom.id} href={`/classrooms/${classroom.id}`} className="flex min-w-0 items-center gap-4 rounded-2xl border bg-card p-6 hover:border-primary/40"><span className="rounded-xl bg-amber-50 p-3 text-amber-800"><Users className="size-5" /></span><div className="min-w-0 flex-1"><h3 className="font-semibold break-words">{classroom.title}</h3><p className="mt-1 text-sm text-muted-foreground">{classroom.join_enabled ? "Đang nhận thành viên" : "Đã đóng tham gia"}</p></div><ArrowRight className="size-4 shrink-0 text-primary" /></Link>)}</div> : <EmptyState title="Chưa có lớp học" description={canEdit ? "Tạo lớp học để quản lý thành viên và chia sẻ mã tham gia." : "Bạn chưa tham gia lớp nào được hiển thị trong môn này."} />}</TabsContent>}
    </Tabs>}
  </div>;
}

function ChapterFilter({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <Button variant={active ? "secondary" : "ghost"} aria-pressed={active} onClick={onClick} className={`h-auto min-h-11 w-full justify-start gap-3 px-3 py-3 text-left whitespace-normal ${active ? "bg-accent text-primary" : "text-muted-foreground"}`}><BookOpen className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{label}</span><span className="text-xs">{count}</span></Button>;
}
