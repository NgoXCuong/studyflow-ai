"use client";

import Link from "next/link";
import { useState } from "react";
import { History, LockKeyhole, Search } from "lucide-react";
import { AdminUserEditor } from "@/components/admin-user-editor";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { useUser } from "@/components/study-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { formatDate, roleLabel, type User } from "@/lib/api";

export function AdminUsers() {
  const { user } = useUser();
  if (user.role !== "admin") return <Feedback error="Chỉ quản trị viên được truy cập phần quản lý tài khoản." />;
  return <AccountList />;
}

function AccountList() {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ q: "", role: "all", status: "all", page: 0 });
  const query = new URLSearchParams({ limit: "21", offset: String(filters.page * 20) });
  if (filters.q) query.set("q", filters.q);
  if (filters.role !== "all") query.set("role", filters.role);
  if (filters.status !== "all") query.set("status", filters.status);
  const { data, error, reload } = useResource<User[]>(`/admin/users?${query}`);

  return <div className="min-w-0 space-y-5">
    <header><p className="eyebrow mb-2">Quản trị</p><h1 className="page-heading">Quản lý tài khoản</h1><p className="mt-2 text-sm text-muted-foreground">Tìm tài khoản, quản lý trạng thái và cấp hoặc thu vai trò giảng viên.</p></header>
    <Feedback message={notice} />
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3" onSubmit={event => { event.preventDefault(); setFilters(value => ({ ...value, q: draft.trim(), page: 0 })); }}>
      <div className="field min-w-0 flex-1 basis-64"><Label htmlFor="account-search">Tìm tài khoản</Label><Input id="account-search" className="app-input" placeholder="Họ tên hoặc email…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={200} /></div>
      <div className="field min-w-0 flex-1 basis-40"><Label htmlFor="account-role">Vai trò</Label><Select value={filters.role} onValueChange={value => setFilters(current => ({ ...current, role: value ?? "all", page: 0 }))} items={[{ value: "all", label: "Tất cả vai trò" }, ...Object.entries(roleLabel).map(([value, label]) => ({ value, label }))]}><SelectTrigger id="account-role" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả vai trò</SelectItem>{Object.entries(roleLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="field min-w-0 flex-1 basis-40"><Label htmlFor="account-status">Trạng thái</Label><Select value={filters.status} onValueChange={value => setFilters(current => ({ ...current, status: value ?? "all", page: 0 }))} items={[{ value: "all", label: "Tất cả trạng thái" }, { value: "active", label: "Hoạt động" }, { value: "locked", label: "Đã khóa" }]}><SelectTrigger id="account-status" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="active">Hoạt động</SelectItem><SelectItem value="locked">Đã khóa</SelectItem></SelectContent></Select></div>
      <Button type="submit" variant="outline" className="h-11"><Search />Tìm</Button>
      {(filters.q || filters.role !== "all" || filters.status !== "all") && <Button type="button" variant="ghost" className="h-11" onClick={() => { setDraft(""); setFilters({ q: "", role: "all", status: "all", page: 0 }); }}>Bỏ lọc</Button>}
    </form>
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <>
      {!data.length ? <EmptyState title="Không tìm thấy tài khoản" description="Thử họ tên, email khác hoặc bỏ bộ lọc đang chọn." /> : <div className="overflow-hidden rounded-xl border bg-card"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="px-4">Tài khoản</TableHead><TableHead>Vai trò</TableHead><TableHead>Trạng thái</TableHead><TableHead>Ngày tạo</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{data.slice(0, 20).map(user => <TableRow key={user.id}><TableCell className="max-w-sm px-4 py-4 whitespace-normal"><p className="font-medium break-words">{user.full_name}</p><p className="mt-1 break-all text-xs text-muted-foreground">{user.email}</p></TableCell><TableCell><Badge variant="secondary">{roleLabel[user.role]}</Badge></TableCell><TableCell><Badge variant={user.status === "locked" ? "destructive" : "outline"}>{user.status === "active" ? "Hoạt động" : "Đã khóa"}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{formatDate(user.created_at)}</TableCell><TableCell><div className="flex flex-wrap justify-end gap-2">{user.role === "admin" ? <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Được bảo vệ</span> : <AdminUserEditor user={user} onSaved={() => { setNotice("Đã lưu quyền và trạng thái tài khoản."); reload(); }} />}<Link href={`/admin/audit-logs?target_user_id=${user.id}`} className={buttonVariants({ variant: "ghost", className: "h-10" })}><History />Nhật ký</Link></div></TableCell></TableRow>)}</TableBody></Table></div>}
      <Pagination page={filters.page} hasNext={data.length > 20} onPage={page => setFilters(value => ({ ...value, page }))} />
    </>}
  </div>;
}
