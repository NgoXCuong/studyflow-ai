"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { roleLabel, type User } from "@/lib/api";

type AuditLog = {
  id: string; actor_id: string; action: string; target_user_id: string | null;
  old_role: User["role"] | null; new_role: User["role"] | null;
  old_status: User["status"] | null; new_status: User["status"] | null; created_at: string;
};
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const statusLabel = { active: "Hoạt động", locked: "Đã khóa" };

export function AdminAudit() {
  const { user } = useUser();
  if (user.role !== "admin") return <Feedback error="Chỉ quản trị viên được xem nhật ký quản trị." />;
  return <AuditList />;
}

function AuditList() {
  const { user } = useUser();
  const params = useSearchParams();
  const [targetDraft, setTargetDraft] = useState(params.get("target_user_id") ?? "");
  const [actorDraft, setActorDraft] = useState(params.get("actor_id") ?? "");
  const [filters, setFilters] = useState({ target: params.get("target_user_id") ?? "", actor: params.get("actor_id") ?? "", page: 0 });
  const query = new URLSearchParams({ limit: "21", offset: String(filters.page * 20) });
  if (filters.target) query.set("target_user_id", filters.target);
  if (filters.actor) query.set("actor_id", filters.actor);
  const { data, error, reload } = useResource<AuditLog[]>(`/admin/audit-logs?${query}`);

  return <div className="min-w-0 space-y-5">
    <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />Quản lý tài khoản</Link>
    <header><p className="eyebrow mb-2">Quản trị</p><h1 className="page-heading">Nhật ký quản trị</h1><p className="mt-2 text-sm text-muted-foreground">Đối chiếu người thực hiện, tài khoản bị tác động và thay đổi đã được lưu.</p></header>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" onSubmit={event => { event.preventDefault(); setFilters({ target: targetDraft.trim(), actor: actorDraft.trim(), page: 0 }); }}>
      <div className="field min-w-0 flex-1 basis-64"><Label htmlFor="audit-target">ID tài khoản bị thay đổi</Label><Input id="audit-target" className="app-input" placeholder="UUID tài khoản (không bắt buộc)" value={targetDraft} onChange={event => setTargetDraft(event.target.value)} pattern={uuidPattern} maxLength={36} autoComplete="off" /></div>
      <div className="field min-w-0 flex-1 basis-64"><Label htmlFor="audit-actor">ID người thực hiện</Label><Input id="audit-actor" className="app-input" placeholder="UUID admin (không bắt buộc)" value={actorDraft} onChange={event => setActorDraft(event.target.value)} pattern={uuidPattern} maxLength={36} autoComplete="off" /></div>
      <Button type="submit" variant="outline" className="h-11"><Search />Lọc nhật ký</Button>{(filters.actor || filters.target) && <Button type="button" variant="ghost" className="h-11" onClick={() => { setTargetDraft(""); setActorDraft(""); setFilters({ target: "", actor: "", page: 0 }); }}>Bỏ lọc</Button>}
    </form>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length ? <EmptyState title="Chưa có nhật ký trong phạm vi này" description="Thay đổi tài khoản thành công sẽ được ghi lại. Gửi lại giá trị cũ không tạo nhật ký mới." /> : <div className="overflow-hidden rounded-xl border bg-card"><Table className="min-w-[800px]"><TableHeader><TableRow><TableHead className="px-4">Thời điểm</TableHead><TableHead>Người thực hiện</TableHead><TableHead>Tài khoản bị thay đổi</TableHead><TableHead>Thay đổi</TableHead></TableRow></TableHeader><TableBody>{data.slice(0, 20).map(log => <TableRow key={log.id}>
        <TableCell className="px-4 py-4 text-xs text-muted-foreground">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(log.created_at))}</TableCell>
        <TableCell className="max-w-52 whitespace-normal">{log.actor_id === user.id && <p className="mb-1 text-sm font-medium">{user.full_name} (bạn)</p>}<span className="font-mono text-xs break-all">{log.actor_id}</span></TableCell>
        <TableCell className="max-w-52 font-mono text-xs whitespace-normal break-all">{log.target_user_id ?? "—"}</TableCell>
        <TableCell className="space-y-2 whitespace-normal"><Badge variant="secondary">{log.action === "user_updated" ? "Cập nhật tài khoản" : log.action}</Badge>{log.old_role !== log.new_role && <p className="text-sm">Vai trò: {log.old_role ? roleLabel[log.old_role] : "—"} → {log.new_role ? roleLabel[log.new_role] : "—"}</p>}{log.old_status !== log.new_status && <p className="text-sm">Trạng thái: {log.old_status ? statusLabel[log.old_status] : "—"} → {log.new_status ? statusLabel[log.new_status] : "—"}</p>}</TableCell>
      </TableRow>)}</TableBody></Table></div>}
      <Pagination page={filters.page} hasNext={data.length > 20} onPage={page => setFilters(value => ({ ...value, page }))} />
    </>}
  </div>;
}
