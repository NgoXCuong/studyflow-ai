"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, LoaderCircle } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/feedback";
import { DocumentProcessingPanel } from "@/components/document-processing";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";
import { formatFileSize, type StudyDocument } from "@/lib/documents";

export function DocumentViewer() {
  const { documentId } = useParams<{ documentId: string }>();
  return <Viewer key={documentId} documentId={documentId} />;
}

function Viewer({ documentId }: { documentId: string }) {
  const { user } = useUser();
  const { data: document, error, reload } = useResource<StudyDocument>(`/documents/${documentId}`);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const [revision, setRevision] = useState(0);

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
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="page-heading break-words">{document.title}</h1><p className="mt-2 break-all text-sm text-muted-foreground">{document.original_filename} · {formatFileSize(document.size_bytes)}{document.page_count != null ? ` · ${document.page_count} trang` : ""}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{document.classroom_id ? "Tài liệu lớp" : "Tài liệu cá nhân"}</Badge></div></div>
      {preview && !fileError && <div className="flex flex-wrap gap-2"><a href={preview} download={document.original_filename} className={buttonVariants({ variant: "outline", size: "lg" })}><Download />Tải PDF</a><a href={preview} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}><ExternalLink />Mở tab mới</a></div>}
    </header>
    <DocumentProcessingPanel documentId={documentId} canRetry={document.owner_id === user.id && (document.classroom_id ? user.role === "teacher" : user.role === "student")} />
    {fileError ? <ErrorState message={fileError} retry={() => { setPreview(""); setFileError(""); setRevision(value => value + 1); }} /> : preview ? <>
      <iframe src={preview} title={`PDF: ${document.title}`} className="h-[72dvh] min-h-96 w-full rounded-xl border bg-card" />
      <p className="text-xs text-muted-foreground">Nếu trình duyệt không hiển thị PDF, chọn “Mở tab mới” hoặc “Tải PDF”.</p>
    </> : <div role="status" className="flex min-h-64 items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Đang tải PDF có kiểm tra quyền truy cập…</div>}
    <Button variant="ghost" render={<Link href={`/courses/${document.course_id}?tab=documents`} />} nativeButton={false}><FileText />Tài liệu trong môn học</Button>
  </div>;
}
