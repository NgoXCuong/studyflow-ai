"use client";

import { BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function Feedback({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  return <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"} className={error ? "" : "border-primary/20 bg-accent text-accent-foreground"}>
    <AlertDescription className="text-inherit">{error || message}</AlertDescription>
  </Alert>;
}

export function LoadingState() {
  return <div role="status" className="space-y-5"><span className="sr-only">Đang tải nội dung…</span><Skeleton className="h-8 w-2/3 max-w-sm" /><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div></div>;
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="space-y-4"><Feedback error={message} /><Button variant="outline" onClick={retry}><RefreshCw />Thử lại</Button></div>;
}

export function EmptyState({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
    <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><BookOpen className="size-6" /></span>
    <h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    {children && <div className="mt-6">{children}</div>}
  </div>;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <Button type="submit" disabled={pending} className="h-11">{pending && <LoaderCircle className="animate-spin" />}{pending ? "Đang xử lý…" : children}</Button>;
}

export function Pagination({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) {
  if (page === 0 && !hasNext) return null;
  return <nav aria-label="Phân trang" className="mt-6 flex flex-wrap items-center justify-end gap-3 text-sm"><span className="mr-auto text-muted-foreground">Trang {page + 1}</span><Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>Trước</Button><Button variant="outline" disabled={!hasNext} onClick={() => onPage(page + 1)}>Tiếp</Button></nav>;
}
