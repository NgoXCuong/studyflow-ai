"use client";

import { useEffect, useState } from "react";
import { Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import { DocumentStatusBadge } from "@/components/document-list";
import { ErrorState, Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResource } from "@/hooks/use-resource";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { DocumentProcessing } from "@/lib/documents";

export function DocumentProcessingPanel({ documentId, canRetry, onStatusChange }: { documentId: string; canRetry: boolean; onStatusChange?: (status: DocumentProcessing["status"]) => void }) {
  const { data, error, reload, refresh } = useResource<DocumentProcessing>(`/documents/${documentId}/processing`);
  const [pending, setPending] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => {
    if (!data || (data.status !== "queued" && data.status !== "processing")) return;
    const timer = setTimeout(refresh, 5000);
    return () => clearTimeout(timer);
  }, [data, refresh]);

  useEffect(() => { if (data) onStatusChange?.(data.status); }, [data, onStatusChange]);

  async function retry() {
    if (pending) return;
    setPending(true); setRetryError("");
    try {
      await api<DocumentProcessing>(`/documents/${documentId}/processing/retry`, { method: "POST" });
      reload();
    } catch (err) {
      setRetryError(errorMessage(err));
      if (err instanceof ApiError && [403, 404, 409].includes(err.status)) refresh();
    } finally { setPending(false); }
  }

  return <Card className="gap-0 border py-0 shadow-none" aria-label="Xử lý nội dung tài liệu">
    <CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Xử lý nội dung tài liệu</h2>
        {data && <div aria-live="polite"><DocumentStatusBadge status={data.status} /></div>}
      </div>
      {error ? <ErrorState message={`Không tải được trạng thái xử lý: ${error}`} retry={reload} /> : !data ?
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Đang tải trạng thái xử lý…</p> : <>
          {data.status === "queued" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4 shrink-0" />Tài liệu đang chờ xử lý. Trạng thái sẽ tự cập nhật.</p>}
          {data.status === "processing" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 shrink-0 animate-spin" />Đang phân tích nội dung tài liệu. Bạn vẫn có thể đọc PDF gốc.</p>}
          {data.status === "ready" && <p className="text-sm text-muted-foreground">Đã xử lý xong nội dung tài liệu · {data.chunk_count.toLocaleString("vi-VN")} đoạn văn bản.</p>}
          {data.status === "failed" && <div className="space-y-3">
            <Feedback error={data.error_message ?? "Chưa xử lý được nội dung tài liệu."} />
            {data.error_code === "storage_file_missing" && canRetry && <p className="text-sm text-muted-foreground">File gốc không còn trong kho. Về danh sách tài liệu và tải lại PDF trước khi xử lý.</p>}
            {canRetry && <Button type="button" variant="outline" className="h-10" disabled={pending} onClick={retry}>
              {pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{pending ? "Đang gửi yêu cầu…" : "Thử xử lý lại"}
            </Button>}
          </div>}
          {data.attempt_count > 0 && <p className="text-xs text-muted-foreground">Đã thực hiện {data.attempt_count} lần xử lý.</p>}
        </>}
      <Feedback error={retryError} />
    </CardContent>
  </Card>;
}
