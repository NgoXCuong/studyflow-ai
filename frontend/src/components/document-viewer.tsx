"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, LoaderCircle } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/feedback";
import { DocumentQuizzes } from "@/components/document-quizzes";
import { DocumentStudyMaterials } from "@/components/document-study-materials";
import { PDFSelectionEditor } from "@/components/pdf-selection-editor";
import type { PDFSelection, StudyMaterial } from "@/lib/study-materials";
import { DocumentQA } from "@/components/document-qa";
import { DocumentProcessingPanel } from "@/components/document-processing";
import { useUser } from "@/components/study-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";
import { formatFileSize, type StudyDocument } from "@/lib/documents";

const SelectablePDF = dynamic(() => import("@/components/selectable-pdf").then(module => module.SelectablePDF), {
  ssr: false, loading: () => <LoadingState />,
});

export function DocumentViewer() {
  const { documentId } = useParams<{ documentId: string }>();
  return <Viewer key={documentId} documentId={documentId} />;
}

function Viewer({ documentId }: { documentId: string }) {
  const searchParams = useSearchParams();
  const sourcePage = Number(searchParams.get("page"));
  const pageFragment = Number.isSafeInteger(sourcePage) && sourcePage > 0 ? `#page=${sourcePage}` : "";
  const { user } = useUser();
  const { data: document, error, reload } = useResource<StudyDocument>(`/documents/${documentId}`);
  const [processingStatus, setProcessingStatus] = useState<StudyDocument["status"]>();
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("read");
  const [selection, setSelection] = useState<PDFSelection | null>(null);
  const [savedMaterial, setSavedMaterial] = useState<StudyMaterial | null>(null);
  const [materialRevision, setMaterialRevision] = useState(0);

  useEffect(() => {
    if (!document) return;
    const controller = new AbortController();
    let objectUrl = "";
    api<Blob>(`/documents/${documentId}/file`, { signal: controller.signal }, true, "blob").then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview(objectUrl); setFileError("");
    }, err => { if (!controller.signal.aborted) setFileError(errorMessage(err)); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document, documentId, revision]);

  if (error) return <div className="space-y-4"><Link href="/courses" className="text-sm text-primary">Về danh sách môn học</Link><ErrorState message={error} retry={reload} /></div>;
  if (!document) return <LoadingState />;
  const back = document.classroom_id ? `/classrooms/${document.classroom_id}` : `/courses/${document.course_id}?tab=documents`;
  return <div className="space-y-4">
    <Link href={back} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Về tài liệu {document.classroom_id ? "lớp học" : "môn học"}</Link>
    <PageHeader icon={FileText} eyebrow={document.classroom_id ? "Tài liệu lớp học" : "Thư viện cá nhân"} title={document.title} description={<span className="break-all">{document.original_filename} · {formatFileSize(document.size_bytes)}{document.page_count != null ? ` · ${document.page_count} trang` : ""}</span>} actions={preview && !fileError && <><a href={preview} download={document.original_filename} className={buttonVariants({ variant: "outline", size: "lg" })}><Download />Tải PDF</a><a href={preview} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}><ExternalLink />Mở tab mới</a></>} />
    <DocumentProcessingPanel onStatusChange={setProcessingStatus} documentId={documentId} canRetry={document.owner_id === user.id && (document.classroom_id ? user.role === "teacher" : user.role === "student")} />
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-5">
      <TabsList className="w-full flex-wrap justify-start rounded-xl border p-1 group-data-horizontal/tabs:h-auto" aria-label="Không gian tài liệu">
        <TabsTrigger value="read" className="min-h-12 flex-none px-4">Đọc & hỏi đáp</TabsTrigger>
        {user.role !== "admin" && <TabsTrigger value="quizzes" className="min-h-12 flex-none px-4">Quiz từ tài liệu</TabsTrigger>}
        {user.role !== "admin" && <><TabsTrigger value="flashcards" className="min-h-12 flex-none px-4">Flashcard</TabsTrigger><TabsTrigger value="mindmap" className="min-h-12 flex-none px-4">Sơ đồ tư duy</TabsTrigger></>}
      </TabsList>
      <TabsContent value="read" keepMounted>
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3 xl:sticky xl:top-28" aria-label="Đọc tài liệu PDF">
    {fileError ? <ErrorState message={fileError} retry={() => { setPreview(""); setFileError(""); setRevision(value => value + 1); }} /> : preview ? <>
      {user.role === "admin" ? <iframe src={`${preview}${pageFragment}`} title={`PDF: ${document.title}`} className="h-[72dvh] min-h-96 w-full rounded-xl border bg-card" /> : <>
        <SelectablePDF key={`${preview}-${sourcePage}`} url={preview} initialPage={Number.isSafeInteger(sourcePage) && sourcePage > 0 ? sourcePage : 1} onSelection={setSelection} />
        <PDFSelectionEditor documentId={documentId} documentTitle={document.title} selection={selection} onClear={() => setSelection(null)} onSaved={value => { setSavedMaterial(value); setMaterialRevision(current => current + 1); setTab(value.kind); }} />
      </>}
      <p className="text-xs text-muted-foreground">Nếu PDF không hiển thị được, chọn “Mở tab mới” hoặc “Tải PDF”.</p>
    </> : <div role="status" className="flex min-h-64 items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Đang tải PDF có kiểm tra quyền truy cập…</div>}
          </section>
          <DocumentQA documentId={documentId} preview={fileError ? "" : preview} />
        </div>
      </TabsContent>
      {user.role !== "admin" && <TabsContent value="quizzes" keepMounted><DocumentQuizzes documentId={documentId} title={document.title} classroomQuiz={user.role === "teacher" && !!document.classroom_id} ready={(processingStatus ?? document.status) === "ready"} preview={fileError ? "" : preview} /></TabsContent>}
      {user.role !== "admin" && (["flashcards", "mindmap"] as const).map(kind => <TabsContent key={kind} value={kind} keepMounted><DocumentStudyMaterials key={`${kind}-${materialRevision}`} focused={savedMaterial?.kind === kind ? savedMaterial : undefined} documentId={documentId} kind={kind} ready={(processingStatus ?? document.status) === "ready"} preview={fileError ? "" : preview} /></TabsContent>)}
    </Tabs>
    <Button variant="ghost" render={<Link href={`/courses/${document.course_id}?tab=documents`} />} nativeButton={false}><FileText />Tài liệu trong môn học</Button>
  </div>;
}
