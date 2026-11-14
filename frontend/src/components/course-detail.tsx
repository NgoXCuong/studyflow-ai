"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, FileText, Hash, Layers3, Users } from "lucide-react";
import { ChapterEditor, ClassroomEditor, ConfirmAction, CourseEditor, TopicEditor } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { ErrorState, LoadingState } from "@/components/feedback";
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

  return <div className="w-full space-y-5">
    <Link href="/courses" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Môn học của bạn</Link>
    <Card className="gap-0 rounded-2xl border bg-background/60 py-0 shadow-none ring-0"><CardContent className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5"><div className="flex min-w-0 flex-1 items-start gap-4"><span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-card text-primary sm:flex"><BookOpen className="size-7" /></span><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{course.kind === "personal" ? "Môn cá nhân" : user.role === "teacher" ? "Môn giảng dạy" : "Môn học qua lớp"}</Badge><span className="text-xs text-muted-foreground">{canEdit ? "Bạn quản lý" : "Nội dung được chia sẻ qua lớp"}</span></div><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1><p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{course.description || "Sắp xếp nội dung, khám phá tài liệu và học theo từng chủ đề."}</p></div></div>
        <div className="flex flex-wrap gap-2">{user.role === "student" && <Button variant="outline" nativeButton={false} className="min-h-11 bg-card" render={<Link href={`/progress?course_id=${courseId}`} />}><ChartNoAxesCombined />Kết quả học tập</Button>}{canEdit && (user.role === "student" || user.role === "teacher") && <><CourseEditor course={course} role={user.role} onSaved={reload} /><ConfirmAction title="Xóa môn học?" description={`Môn “${course.title}” và nội dung liên quan sẽ không còn truy cập được qua môn học này.`} action={() => api(`/courses/${courseId}`, { method: "DELETE" })} onDone={() => router.push("/courses")} /></>}</div>
      </div>
      {content && <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Layers3 className="size-4 text-primary" /><strong className="font-semibold text-foreground">{content.chapters.length}</strong> chương học</span><span className="inline-flex items-center gap-2"><Hash className="size-4 text-primary" /><strong className="font-semibold text-foreground">{content.topics.length}</strong> chủ đề</span>{course.kind === "teaching" && <span className="inline-flex items-center gap-2"><Users className="size-4 text-primary" /><strong className="font-semibold text-foreground">{content.classrooms.length}</strong> lớp trong phạm vi của bạn</span>}</div>}
    </CardContent></Card>

    {contentError ? <ErrorState message={contentError} retry={reloadContent} /> : !content ? <LoadingState /> : <Tabs value={activeTab} onValueChange={value => setActiveTab(String(value))} className="min-w-0 gap-0 overflow-hidden rounded-2xl border bg-card">
      <TabsList variant="line" aria-label="Các khu vực môn học" className="w-full flex-wrap justify-start gap-1 rounded-none border-b bg-background/40 px-3 py-1 group-data-horizontal/tabs:h-auto sm:px-5"><TabsTrigger value="curriculum" className="min-h-12 flex-none gap-2 px-3"><Layers3 />Nội dung<span className="hidden sm:inline">môn học</span></TabsTrigger><TabsTrigger value="documents" className="min-h-12 flex-none gap-2 px-3"><FileText />Tài liệu PDF</TabsTrigger>{course.kind === "teaching" && <TabsTrigger value="classrooms" className="min-h-12 flex-none gap-2 px-3"><Users />Lớp học<Badge variant="secondary" className="ml-1">{content.classrooms.length}</Badge></TabsTrigger>}</TabsList>
      <TabsContent value="documents" className="min-w-0 p-4 sm:p-6"><DocumentList course={course} chapters={content.chapters} classrooms={content.classrooms} /></TabsContent>
      <TabsContent value="curriculum" className="min-w-0"><div className="grid items-stretch lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b bg-background/50 p-4 sm:p-5 lg:border-r lg:border-b-0"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Mục lục môn học</p><h2 className="font-semibold">Chương & chủ đề</h2></div><Badge variant="outline" className="bg-card">{content.chapters.length}</Badge></div><nav aria-label="Lọc chủ đề theo chương" className="space-y-1.5"><ChapterFilter active={chapterFilter === "all"} onClick={() => setChapterFilter("all")} label="Tất cả chủ đề" count={content.topics.length} />{content.chapters.map(chapter => <ChapterFilter key={chapter.id} active={chapterFilter === chapter.id} onClick={() => setChapterFilter(chapter.id)} label={chapter.title} count={content.topics.filter(topic => topic.chapter_id === chapter.id).length} />)}<ChapterFilter active={chapterFilter === "none"} onClick={() => setChapterFilter("none")} label="Không thuộc chương" count={content.topics.filter(topic => topic.chapter_id === null).length} /></nav>{canEdit && <div className="mt-5 border-t pt-4"><ChapterEditor courseId={courseId} onSaved={reloadContent} /></div>}</aside>
        <section className="min-w-0 space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{chapterFilter === "all" ? "Tất cả chủ đề" : chapterFilter === "none" ? "Chủ đề độc lập" : content.chapters.find(c => c.id === chapterFilter)?.title}</h2><p className="mt-1 text-sm text-muted-foreground">{topics.length} chủ đề{chapterFilter === "all" ? " trong môn học" : " trong mục này"}</p></div>{canEdit && <TopicEditor courseId={courseId} chapters={content.chapters} onSaved={reloadContent} />}</div>
          {topics.length ? <div className="grid items-start gap-4 2xl:grid-cols-2">{topics.map(topic => <Card key={topic.id} className="gap-0 rounded-xl border py-0 shadow-none ring-0"><CardContent className="p-5"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Hash className="size-5" /></span><div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{content.chapters.find(chapter => chapter.id === topic.chapter_id)?.title ?? "Không thuộc chương"}</p><h3 className="break-words text-base font-semibold">{topic.title}</h3></div></div>{topic.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{topic.description}</p>}{canEdit && <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><TopicEditor courseId={courseId} topic={topic} chapters={content.chapters} onSaved={reloadContent} /><ConfirmAction title="Xóa chủ đề?" description={`Chủ đề “${topic.title}” sẽ bị xóa khỏi môn học.`} action={() => api(`/courses/${courseId}/topics/${topic.id}`, { method: "DELETE" })} onDone={reloadContent} /></div>}</CardContent></Card>)}</div> : <>
            <Card className="gap-0 rounded-xl border border-dashed bg-background/40 py-0 shadow-none ring-0"><CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Layers3 className="size-6" /></span><div className="min-w-0"><h3 className="font-semibold">Chưa có chủ đề trong mục này</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{canEdit ? "Thêm chủ đề để tổ chức kiến thức theo chương. Bạn cũng có thể mở khu vực tài liệu để bắt đầu từ một PDF." : "Giảng viên chưa bổ sung chủ đề trong mục này. Bạn vẫn có thể kiểm tra tài liệu được chia sẻ và truy cập các lớp đang tham gia."}</p></div></CardContent></Card>
            <div className="grid gap-4 xl:grid-cols-2"><Card className="gap-0 rounded-xl border py-0 shadow-none ring-0"><CardContent className="space-y-4 p-5"><FileText className="size-6 text-primary" /><div><h3 className="font-semibold">Bắt đầu từ tài liệu</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Đọc PDF, đặt câu hỏi và luyện tập từ tài liệu bạn có quyền truy cập.</p></div><Button variant="outline" className="min-h-11" onClick={() => setActiveTab("documents")}>Mở tài liệu<ArrowRight /></Button></CardContent></Card>
              {course.kind === "teaching" ? <Card className="gap-0 rounded-xl border py-0 shadow-none ring-0"><CardContent className="space-y-4 p-5"><Users className="size-6 text-primary" /><div><h3 className="font-semibold">Kết nối với lớp học</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{content.classrooms.length} lớp học trong phạm vi của bạn. Mở lớp để xem nội dung và bài được giao.</p></div><Button variant="outline" className="min-h-11" onClick={() => setActiveTab("classrooms")}>Xem lớp học<ArrowRight /></Button></CardContent></Card> : user.role === "student" && <Card className="gap-0 rounded-xl border py-0 shadow-none ring-0"><CardContent className="space-y-4 p-5"><ChartNoAxesCombined className="size-6 text-primary" /><div><h3 className="font-semibold">Theo dõi việc học</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Xem kết quả quiz theo chủ đề để chọn nội dung cần ôn tiếp theo.</p></div><Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href={`/progress?course_id=${courseId}`} />}>Xem kết quả<ArrowRight /></Button></CardContent></Card>}
            </div>
          </>}
          {canEdit && content.chapters.length > 0 && <section className="space-y-3 border-t pt-5"><h2 className="text-base font-semibold">Quản lý chương</h2><p className="text-sm text-muted-foreground">Chuyển các chủ đề và tài liệu ra khỏi chương trước khi xóa.</p>{content.chapters.map(chapter => <div key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/40 p-4"><div className="min-w-0"><p className="break-words font-medium">{chapter.title}</p><p className="mt-1 text-xs text-muted-foreground">Thứ tự: {chapter.position}</p></div><div className="flex flex-wrap gap-2"><ChapterEditor courseId={courseId} chapter={chapter} onSaved={reloadContent} /><ConfirmAction title="Xóa chương?" description={`Chương “${chapter.title}” chỉ có thể xóa khi không còn chủ đề hoặc tài liệu tham chiếu.`} action={() => api(`/courses/${courseId}/chapters/${chapter.id}`, { method: "DELETE" })} onDone={() => { setChapterFilter("all"); reloadContent(); }} /></div></div>)}</section>}
        </section>
      </div></TabsContent>
      {course.kind === "teaching" && <TabsContent value="classrooms" className="min-w-0 space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Lớp học trong môn</h2><p className="mt-1 text-sm text-muted-foreground">{canEdit ? "Quản lý các lớp bạn phụ trách và nội dung được chia sẻ." : "Các lớp bạn đang tham gia thuộc môn học này."}</p></div>{canEdit && user.role === "teacher" && <ClassroomEditor courseId={courseId} onSaved={reloadContent} />}</div>{content.classrooms.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{content.classrooms.map(classroom => <Card key={classroom.id} className="gap-0 rounded-xl border py-0 shadow-none ring-0"><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary"><Users className="size-5" /></span><Badge variant="outline">{canEdit ? "Lớp phụ trách" : "Đang tham gia"}</Badge></div><div><h3 className="break-words text-lg font-semibold">{classroom.title}</h3><p className="mt-2 text-sm text-muted-foreground">{classroom.join_enabled ? "Đang nhận thành viên" : "Đã đóng nhận thành viên mới"}</p></div><Button variant="outline" className="min-h-11 w-full justify-between" nativeButton={false} render={<Link href={`/classrooms/${classroom.id}`} />}>Mở không gian lớp<ArrowUpRight /></Button></CardContent></Card>)}</div> : <Card className="gap-0 border border-dashed bg-background/40 py-0 shadow-none ring-0"><CardContent className="flex items-start gap-4 p-5"><Users className="mt-1 size-6 shrink-0 text-primary" /><div><h3 className="font-semibold">Chưa có lớp học</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{canEdit ? "Tạo lớp học để quản lý thành viên, chia sẻ tài liệu và giao quiz." : "Các lớp bạn tham gia trong môn này sẽ xuất hiện tại đây."}</p></div></CardContent></Card>}</TabsContent>}
    </Tabs>}
  </div>;
}

function ChapterFilter({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <Button variant="ghost" aria-pressed={active} onClick={onClick} className={`h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-xl border px-3 py-3 text-left ${active ? "border-primary/20 bg-card font-semibold text-primary shadow-sm hover:bg-card" : "border-transparent text-muted-foreground hover:bg-card/70"}`}><BookOpen className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{label}</span><span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs ${active ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}>{count}</span></Button>;
}
