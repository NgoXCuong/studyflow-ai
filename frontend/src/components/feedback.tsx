"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function Feedback({
  error,
  message,
  inlineError = true,
}: {
  error?: string;
  message?: string;
  inlineError?: boolean;
}) {
  useEffect(() => {
    if (error) toast.error(error, { id: `feedback-error:${error}` });
    else if (message) toast.success(message, { id: `feedback-success:${message}` });
  }, [error, message]);

  if (!error || !inlineError) return null;
  return (
    <Alert
      variant="destructive"
      role="alert"
    >
      <AlertDescription className="text-inherit">
        {error}
      </AlertDescription>
    </Alert>
  );
}

export function LoadingState() {
  return (
    <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 py-8">
      <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-primary motion-reduce:animate-none" />
      <p className="text-sm font-medium text-muted-foreground">Đang tải…</p>
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="space-y-4">
      <Feedback error={message} />
      <Button variant="outline" onClick={retry}>
        <RefreshCw />
        Thử lại
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <BookOpen className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending} className="h-11">
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? "Đang xử lý…" : children}
    </Button>
  );
}

export function Pagination({
  page,
  hasNext,
  onPage,
}: {
  page: number;
  hasNext: boolean;
  onPage: (page: number) => void;
}) {
  if (page === 0 && !hasNext) return null;
  return (
    <nav
      aria-label="Phân trang"
      className="mt-6 flex flex-wrap items-center justify-end gap-3 text-sm"
    >
      <span className="mr-auto text-muted-foreground">Trang {page + 1}</span>
      <Button
        variant="outline"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Trước
      </Button>
      <Button
        variant="outline"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
      >
        Tiếp
      </Button>
    </nav>
  );
}
