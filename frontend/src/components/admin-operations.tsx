"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Activity, ArrowRight, FileClock, RefreshCw, Search } from "lucide-react";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { PageHeader } from "@/components/page-header";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { operationLabel, processingStatusLabel, type ProcessingOverview, type UsageOverview } from "@/lib/operations";
import { vietnamDateTime } from "@/lib/study-plans";

type Filters = { documentId: string; ownerId: string; status: string; operation: string; provider: string; model: string; fromDate: string; toDate: string; includeRemoved: boolean };
const emptyFilters: Filters = { documentId: "", ownerId: "", status: "all", operation: "all", provider: "", model: "", fromDate: "", toDate: "", includeRemoved: false };
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const tableClass = "min-w-0 overflow-hidden rounded-2xl border bg-card";
const timeLabel = (value: string | null) => value ? vietnamDateTime(value) : "—";

export function AdminProcessing() {
  const { user } = useUser();
  return user.role === "admin" ? <ProcessingList /> : <Feedback error="Chỉ quản trị viên được xem tác vụ xử lý tài liệu." />;
}

export function AdminAIUsage() {
  const { user } = useUser();
  return user.role === "admin" ? <UsageList /> : <Feedback error="Chỉ quản trị viên được xem lịch sử sử dụng AI." />;
}

function queryFilters(filters: Filters, page: number) {
  const query = new URLSearchParams({ limit: "20", offset: String(page * 20) });
  if (filters.documentId.trim()) query.set("document_id", filters.documentId.trim());
  if (filters.ownerId.trim()) query.set("owner_id", filters.ownerId.trim());
  if (filters.status !== "all") query.set("status", filters.status);
  return query;
}

function ProcessingList() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, documentId: params.get("document_id") ?? "" }));
  const [page, setPage] = useState(0);
  const query = queryFilters(filters, page);
  if (filters.includeRemoved) query.set("include_removed", "true");
  const { data, error, reload } = useResource<ProcessingOverview>(`/admin/processing?${query}`);
  return <div className="min-w-0 space-y-6">
    <PageHeader icon={FileClock} eyebrow="Quản trị / Vận hành" title="Xử lý tài liệu" description="Theo dõi trạng thái hiện tại và lần xử lý gần nhất của từng PDF. Chỉ hiển thị metadata vận hành, không mở nội dung tài liệu." actions={<Button variant="outline" className="min-h-11" onClick={reload}><RefreshCw />Làm mới</Button>} />
    <OperationsFilters filters={filters} onApply={value => { setFilters(value); setPage(0); }} />
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      <Metrics items={Object.entries(processingStatusLabel).map(([status, label]) => ({ label, value: data.counts[status] ?? 0, note: "Trong phạm vi đang lọc" }))} />
      <p className="text-sm text-muted-foreground">{data.total} tài liệu trong phạm vi bộ lọc · thời gian hiển thị UTC+7. Đây là trạng thái hiện tại, không phải lịch sử từng lần thử.</p>
      {!data.items.length ? <EmptyState title="Không có tài liệu trong phạm vi này" description="Thử trạng thái khác, kiểm tra ID hoặc bỏ bộ lọc." /> : <div className={tableClass}><Table className="min-w-[1100px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="px-5">Tài liệu / tài khoản sở hữu</TableHead><TableHead>Trạng thái</TableHead><TableHead>Số lần thử</TableHead><TableHead>Lần xử lý gần nhất</TableHead><TableHead>Mã lỗi</TableHead><TableHead className="text-right">Đối chiếu</TableHead></TableRow></TableHeader><TableBody>{data.items.map(item => <TableRow key={item.document_id}><TableCell className="max-w-64 px-5 py-4 whitespace-normal"><p className="font-mono text-xs break-all select-all">{item.document_id}</p><p className="mt-2 text-xs text-muted-foreground">Tài khoản sở hữu</p><p className="mt-1 font-mono text-xs break-all select-all">{item.owner_id}</p>{item.source_removed && <Badge variant="outline" className="mt-2">Nguồn đã gỡ</Badge>}</TableCell><TableCell><Badge variant={item.status === "failed" ? "destructive" : item.status === "ready" ? "secondary" : "outline"}>{processingStatusLabel[item.status] ?? item.status}</Badge><p className="mt-2 text-xs text-muted-foreground">Cập nhật {timeLabel(item.updated_at)}</p></TableCell><TableCell>{item.attempt_count}</TableCell><TableCell className="space-y-1 text-xs whitespace-normal text-muted-foreground"><p>Bắt đầu: {timeLabel(item.started_at)}</p><p>Kết thúc: {timeLabel(item.finished_at)}</p>{item.lease_expires_at && <p>Hạn giữ lượt của worker: {timeLabel(item.lease_expires_at)}</p>}</TableCell><TableCell className="max-w-48 font-mono text-xs whitespace-normal break-words">{item.error_code ?? "—"}</TableCell><TableCell className="text-right"><Link href={`/admin/ai-usage?document_id=${item.document_id}`} className={buttonVariants({ variant: "outline", className: "min-h-11" })}>Log AI<ArrowRight /></Link></TableCell></TableRow>)}</TableBody></Table></div>}
      <Pagination page={page} hasNext={(page + 1) * 20 < data.total} onPage={setPage} />
    </>}
  </div>;
}

function UsageList() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, documentId: params.get("document_id") ?? "" }));
  const [page, setPage] = useState(0);
  const query = queryFilters(filters, page);
  if (filters.operation !== "all") query.set("operation", filters.operation);
  if (filters.provider.trim()) query.set("provider", filters.provider.trim());
  if (filters.model.trim()) query.set("model", filters.model.trim());
  if (filters.fromDate) query.set("created_from", `${filters.fromDate}T00:00:00+07:00`);
  if (filters.toDate) {
    const nextDay = new Date(new Date(`${filters.toDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    query.set("created_to", `${nextDay}T00:00:00+07:00`);
  }
  const { data, error, reload } = useResource<UsageOverview>(`/admin/ai-usage?${query}`);
  return <div className="min-w-0 space-y-6">
    <PageHeader icon={Activity} eyebrow="Quản trị / Vận hành" title="Sử dụng AI" description="Đối chiếu lượt gọi, model, thời gian và token đã ghi nhận. Thống kê trên toàn bộ phạm vi bộ lọc, độc lập với trang đang xem." actions={<Button variant="outline" className="min-h-11" onClick={reload}><RefreshCw />Làm mới</Button>} />
    <OperationsFilters usage filters={filters} onApply={value => { setFilters(value); setPage(0); }} />
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      <Metrics items={[{ label: "Lượt gọi đã ghi nhận", value: data.total, note: `${data.success_count} thành công · ${data.failed_count} thất bại` }, { label: "Token đã ghi nhận", value: data.recorded_tokens === null ? "Chưa ghi nhận" : data.recorded_tokens.toLocaleString("vi-VN"), note: `Có dữ liệu ở ${data.token_recorded_count}/${data.total} log` }, { label: "Thời gian trung bình", value: data.average_duration_ms === null ? "Chưa có dữ liệu" : `${data.average_duration_ms.toFixed(0)} ms`, note: "Theo từng lượt gọi đã ghi nhận" }]} />
      <div className="space-y-3 rounded-xl border bg-muted/35 p-4"><div className="flex flex-wrap gap-2">{Object.entries(data.operations).map(([operation, count]) => <Badge key={operation} variant="outline">{operationLabel[operation] ?? operation}: {count}</Badge>)}</div><p className="text-sm leading-relaxed text-muted-foreground">Token là tổng phần có dữ liệu; các log thiếu token không được coi là 0. Chi phí chưa được ghi nhận từ nhà cung cấp. Mỗi log là một lượt gọi: một câu hỏi có thể gồm embedding và sinh câu trả lời.</p><p className="text-xs leading-relaxed text-muted-foreground">Các lượt hỏi đáp/tạo quiz trước khi bổ sung ghi log chưa có trong thống kê. Không lưu câu hỏi, prompt, câu trả lời hoặc khóa API trong các log này. Thời gian hiển thị UTC+7.</p></div>
      {!data.items.length ? <EmptyState title="Chưa có log trong phạm vi này" description="Thử khoảng thời gian khác hoặc bỏ bộ lọc. Lượt gọi AI mới sẽ xuất hiện sau khi được ghi nhận." /> : <div className={tableClass}><Table className="min-w-[1200px]"><TableHeader className="bg-muted/50"><TableRow><TableHead className="px-5">Thời điểm / hoạt động</TableHead><TableHead>Model</TableHead><TableHead>Trạng thái</TableHead><TableHead>Token</TableHead><TableHead>Thời gian</TableHead><TableHead>Tài liệu / tài khoản gắn với lượt gọi</TableHead><TableHead>Mã lỗi</TableHead></TableRow></TableHeader><TableBody>{data.items.map(item => <TableRow key={item.id}><TableCell className="px-5 py-4"><p className="text-xs text-muted-foreground">{timeLabel(item.created_at)}</p><p className="mt-2 font-medium">{operationLabel[item.operation] ?? item.operation}</p></TableCell><TableCell className="max-w-56 whitespace-normal"><p className="break-words font-medium">{item.model}</p><p className="mt-1 text-xs text-muted-foreground">{item.provider}</p></TableCell><TableCell><Badge variant={item.status === "failed" ? "destructive" : "secondary"}>{item.status === "failed" ? "Thất bại" : "Thành công"}</Badge></TableCell><TableCell>{item.total_tokens === null ? "Chưa ghi nhận" : item.total_tokens.toLocaleString("vi-VN")}</TableCell><TableCell>{item.duration_ms.toLocaleString("vi-VN")} ms</TableCell><TableCell className="max-w-64 whitespace-normal"><Link href={`/admin/processing?document_id=${item.document_id}`} className="inline-flex min-h-11 items-center font-mono text-xs break-all text-primary">{item.document_id}</Link><p className="mt-1 font-mono text-xs break-all text-muted-foreground select-all">{item.owner_id}</p></TableCell><TableCell className="max-w-48 font-mono text-xs whitespace-normal break-words">{item.error_code ?? "—"}</TableCell></TableRow>)}</TableBody></Table></div>}
      <Pagination page={page} hasNext={(page + 1) * 20 < data.total} onPage={setPage} />
    </>}
  </div>;
}

function Metrics({ items }: { items: { label: string; value: string | number; note: string }[] }) {
  return <div className={`grid gap-4 sm:grid-cols-2 ${items.length === 3 ? "xl:grid-cols-3" : "2xl:grid-cols-4"}`}>{items.map(item => <Card key={item.label} className="gap-0 rounded-2xl border py-0 shadow-none ring-0"><CardContent className="space-y-2 p-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="break-words text-2xl font-semibold">{item.value}</p><p className="text-xs text-muted-foreground">{item.note}</p></CardContent></Card>)}</div>;
}

function OperationsFilters({ usage = false, filters, onApply }: { usage?: boolean; filters: Filters; onApply: (filters: Filters) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const statuses = usage ? { success: "Thành công", failed: "Thất bại" } : processingStatusLabel;
  return <form onSubmit={event => { event.preventDefault(); onApply(draft); }} className="space-y-4 rounded-2xl border bg-muted/35 p-4 sm:p-5">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="field"><Label htmlFor={`${id}-document`}>ID tài liệu</Label><Input id={`${id}-document`} className="min-h-11" value={draft.documentId} onChange={event => setDraft(value => ({ ...value, documentId: event.target.value }))} pattern={uuidPattern} maxLength={36} placeholder="UUID (không bắt buộc)" autoComplete="off" /></div>
      <div className="field"><Label htmlFor={`${id}-owner`}>{usage ? "ID tài khoản gắn với lượt gọi" : "ID tài khoản sở hữu"}</Label><Input id={`${id}-owner`} className="min-h-11" value={draft.ownerId} onChange={event => setDraft(value => ({ ...value, ownerId: event.target.value }))} pattern={uuidPattern} maxLength={36} placeholder="UUID (không bắt buộc)" autoComplete="off" /></div>
      <div className="field"><Label htmlFor={`${id}-status`}>Trạng thái</Label><Select value={draft.status} onValueChange={value => setDraft(current => ({ ...current, status: value ?? "all" }))} items={[{ value: "all", label: "Tất cả trạng thái" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]}><SelectTrigger id={`${id}-status`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem>{Object.entries(statuses).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {usage && <>
        <div className="field"><Label htmlFor={`${id}-operation`}>Hoạt động</Label><Select value={draft.operation} onValueChange={value => setDraft(current => ({ ...current, operation: value ?? "all" }))} items={[{ value: "all", label: "Tất cả hoạt động" }, ...Object.entries(operationLabel).map(([value, label]) => ({ value, label }))]}><SelectTrigger id={`${id}-operation`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả hoạt động</SelectItem>{Object.entries(operationLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="field"><Label htmlFor={`${id}-provider`}>Nhà cung cấp (chính xác)</Label><Input id={`${id}-provider`} className="min-h-11" value={draft.provider} onChange={event => setDraft(value => ({ ...value, provider: event.target.value }))} maxLength={200} placeholder="cohere hoặc gemini" /></div>
        <div className="field"><Label htmlFor={`${id}-model`}>Model (chính xác)</Label><Input id={`${id}-model`} className="min-h-11" value={draft.model} onChange={event => setDraft(value => ({ ...value, model: event.target.value }))} maxLength={200} placeholder="Tên model đã ghi nhận" /></div>
        <div className="field"><Label htmlFor={`${id}-from`}>Từ ngày (UTC+7)</Label><Input id={`${id}-from`} className="min-h-11" type="date" value={draft.fromDate} onChange={event => setDraft(value => ({ ...value, fromDate: event.target.value }))} /></div>
        <div className="field"><Label htmlFor={`${id}-to`}>Đến hết ngày (UTC+7)</Label><Input id={`${id}-to`} className="min-h-11" type="date" value={draft.toDate} onChange={event => setDraft(value => ({ ...value, toDate: event.target.value }))} /></div>
      </>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">{!usage && <div className="flex min-h-11 items-center gap-2"><Checkbox id={`${id}-removed`} checked={draft.includeRemoved} onCheckedChange={checked => setDraft(value => ({ ...value, includeRemoved: checked }))} /><Label htmlFor={`${id}-removed`} className="cursor-pointer font-normal">Gồm nguồn đã gỡ</Label></div>}<div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" className="min-h-11"><Search />Áp dụng bộ lọc</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => { setDraft({ ...emptyFilters }); onApply({ ...emptyFilters }); }}>Bỏ lọc</Button></div></div>
  </form>;
}
