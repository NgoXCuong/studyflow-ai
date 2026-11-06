"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, FileText, Search } from "lucide-react";
import { DocumentForm } from "@/components/document-form";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage, formatDate } from "@/lib/api";
import { listAll, type Chapter, type Classroom, type Course } from "@/lib/courses";
import { documentStatus, formatFileSize, type StudyDocument } from "@/lib/documents";

export function DocumentStatusBadge({ status }: { status: StudyDocument["status"] }) {
  return <Badge variant={status === "failed" ? "destructive" : "secondary"} className={status === "ready" ? "bg-accent text-primary" : ""}>{documentStatus[status]}</Badge>;
}

export function DocumentList({ course, classrooms, chapters: suppliedChapters, classroomId }: {
  course: Course; classrooms: Classroom[]; chapters?: Chapter[]; classroomId?: string;
}) {
  const { user } = useUser();
  const [loadedChapters, setLoadedChapters] = useState<Chapter[]>();
  const [chapterError, setChapterError] = useState("");
  const [chapterRevision, setChapterRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", classroom: classroomId ?? "all", chapter: "all", page: 0 });
  const chapters = suppliedChapters ?? loadedChapters;
  const canManage = course.owner_id === user.id && (course.kind === "personal" || user.role === "teacher");
  const canUpload = canManage && (course.kind === "teaching" || user.role === "student");
  const query = new URLSearchParams({ limit: "13", offset: String(filters.page * 12) });
  if (filters.q) query.set("q", filters.q);
  if (filters.classroom !== "all") query.set("classroom_id", filters.classroom);
  if (filters.chapter !== "all") query.set("chapter_id", filters.chapter);
  const { data, error, reload, refresh } = useResource<StudyDocument[]>(`/courses/${course.id}/documents?${query}`);

  useEffect(() => {
    if (!data?.slice(0, 12).some(document => document.status === "queued" || document.status === "processing")) return;
    const timer = setTimeout(refresh, 5000);
    return () => clearTimeout(timer);
  }, [data, refresh]);

  useEffect(() => {
    if (suppliedChapters) return;
    const controller = new AbortController();
    listAll<Chapter>(`/courses/${course.id}/chapters`, controller.signal).then(
      result => { if (!controller.signal.aborted) { setLoadedChapters(result); setChapterError(""); } },
      err => { if (!controller.signal.aborted) setChapterError(errorMessage(err)); },
    );
    return () => controller.abort();
  }, [course.id, suppliedChapters, chapterRevision]);

  function uploaded() {
    setNotice("Đã tải PDF lên. Tài liệu đang chờ xử lý.");
    setDraft("");
    const reset = { q: "", classroom: classroomId ?? "all", chapter: "all", page: 0 };
    if (!filters.q && filters.classroom === reset.classroom && filters.chapter === "all" && filters.page === 0) reload();
    else setFilters(reset);
  }
  function saved(message: string) { setNotice(message); reload(); }

  return <section className="min-w-0 space-y-4" aria-label="Tài liệu PDF">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Tài liệu PDF</h2><p className="mt-1 text-sm text-muted-foreground">{course.kind === "personal" ? "Tài liệu riêng trong môn học của bạn." : classroomId ? "Tài liệu thuộc lớp học này." : "Tài liệu được phân biệt theo từng lớp trong môn."}</p></div>
      {canUpload && chapters && <DocumentForm course={course} chapters={chapters} classrooms={classrooms} classroomId={classroomId} onSaved={uploaded} disabled={course.kind === "teaching" && !classrooms.length} />}
    </div>
    {canUpload && course.kind === "teaching" && !classrooms.length && <p className="text-sm text-muted-foreground">Tạo lớp học trong môn trước khi tải tài liệu lên.</p>}
    <Feedback message={notice} />
    {chapterError && <ErrorState message={chapterError} retry={() => { setChapterError(""); setChapterRevision(value => value + 1); }} />}
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" onSubmit={event => { event.preventDefault(); setFilters(value => ({ ...value, q: draft.trim(), page: 0 })); }}>
      <div className="field min-w-0 flex-1 basis-48"><Label htmlFor={`document-search-${classroomId ?? course.id}`}>Tìm tài liệu</Label><Input id={`document-search-${classroomId ?? course.id}`} value={draft} onChange={event => setDraft(event.target.value)} maxLength={200} className="app-input" placeholder="Tên tài liệu hoặc tên file…" /></div>
      {!classroomId && course.kind === "teaching" && <div className="field min-w-0 flex-1 basis-44"><Label htmlFor={`document-class-${course.id}`}>Lớp học</Label><Select value={filters.classroom} onValueChange={value => setFilters(current => ({ ...current, classroom: value ?? "all", page: 0 }))} items={[{ value: "all", label: "Tất cả lớp" }, ...classrooms.map(item => ({ value: item.id, label: item.title }))]}><SelectTrigger id={`document-class-${course.id}`} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả lớp</SelectItem>{classrooms.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div>}
      {chapters && <div className="field min-w-0 flex-1 basis-44"><Label htmlFor={`document-chapter-${classroomId ?? course.id}`}>Chương học</Label><Select value={filters.chapter} onValueChange={value => setFilters(current => ({ ...current, chapter: value ?? "all", page: 0 }))} items={[{ value: "all", label: "Tất cả chương" }, ...chapters.map(item => ({ value: item.id, label: item.title }))]}><SelectTrigger id={`document-chapter-${classroomId ?? course.id}`} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả chương</SelectItem>{chapters.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div>}
      <Button type="submit" variant="outline" className="h-11"><Search />Tìm</Button>
      {(filters.q || filters.chapter !== "all" || (!classroomId && filters.classroom !== "all")) && <Button type="button" variant="ghost" className="h-11" onClick={() => { setDraft(""); setFilters({ q: "", chapter: "all", classroom: classroomId ?? "all", page: 0 }); }}>Bỏ lọc</Button>}
    </form>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length ? <EmptyState title="Chưa có tài liệu trong danh sách" description={filters.q || filters.chapter !== "all" ? "Thử tên khác hoặc bỏ bộ lọc để xem thêm tài liệu." : canUpload ? "Tải PDF có văn bản lên để bắt đầu. Tài liệu lớp chỉ hiển thị cho sinh viên sau khi được công bố." : "Tài liệu được phép đọc sẽ xuất hiện tại đây khi giảng viên công bố."} /> : <div className="space-y-3">{data.slice(0, 12).map(document => <Card key={document.id} className="gap-0 border py-0 shadow-none"><CardContent className="p-4">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><FileText className="size-5" /></span><div className="min-w-0 flex-1"><h3 className="font-semibold break-words"><Link href={`/documents/${document.id}`} className="hover:text-primary">{document.title}</Link></h3><p className="mt-1 break-all text-xs text-muted-foreground">{document.original_filename} · {formatFileSize(document.size_bytes)}{document.page_count != null ? ` · ${document.page_count} trang` : ""}</p></div><div className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatDate(document.created_at)}</div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><DocumentStatusBadge status={document.status} /><Badge variant="outline">{document.classroom_id ? (classrooms.find(item => item.id === document.classroom_id)?.title ?? "Tài liệu lớp") : "Cá nhân"}</Badge>{document.classroom_id && <Badge variant="secondary">{document.published_at ? "Đã công bố" : "Chưa công bố"}</Badge>}{document.chapter_id && chapters?.find(item => item.id === document.chapter_id) && <span className="text-xs text-muted-foreground">{chapters.find(item => item.id === document.chapter_id)?.title}</span>}</div>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" className="h-10" render={<Link href={`/documents/${document.id}`} />} nativeButton={false}><Eye />Mở PDF</Button>
          {canManage && document.owner_id === user.id && <>
            {chapters && <DocumentForm course={course} chapters={chapters} classrooms={classrooms} classroomId={classroomId} document={document} onSaved={() => saved("Đã cập nhật thông tin tài liệu.")} />}
            {document.classroom_id && user.role === "teacher" && <ConfirmAction label={document.published_at ? "Ngừng công bố" : "Công bố"} icon={document.published_at ? <EyeOff /> : <Eye />} variant="outline" confirmVariant={document.published_at ? "destructive" : "default"} title={document.published_at ? "Ngừng công bố tài liệu?" : "Công bố tài liệu cho lớp?"} description={document.published_at ? "Sinh viên trong lớp sẽ không thể mở lại tài liệu qua hệ thống sau khi ngừng công bố." : "Sinh viên đang tham gia đúng lớp sẽ có quyền xem và tải file PDF này."} action={() => api(`/documents/${document.id}`, { method: "PATCH", body: JSON.stringify({ published: !document.published_at }) })} onDone={() => saved(document.published_at ? "Đã ngừng công bố tài liệu." : "Đã công bố tài liệu cho lớp.")} />}
            <ConfirmAction title="Xóa tài liệu?" description={`Tài liệu “${document.title}” sẽ không còn truy cập được trong hệ thống. File gốc được giữ trong kho riêng tư.`} action={() => api(`/documents/${document.id}`, { method: "DELETE" })} onDone={() => saved("Đã xóa tài liệu.")} />
          </>}
        </div>
      </CardContent></Card>)}</div>}
      <Pagination page={filters.page} hasNext={data.length > 12} onPage={page => setFilters(value => ({ ...value, page }))} />
    </>}
  </section>;
}
