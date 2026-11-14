"use client";

import { useId, useState } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { Feedback } from "@/components/feedback";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage, roleLabel, type User } from "@/lib/api";

export function AdminUserEditor({ user, onSaved }: { user: User; onSaved: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState(user.role === "teacher" ? "teacher" : "student");
  const [status, setStatus] = useState<string>(user.status);
  const [error, setError] = useState("");
  const changed = role !== user.role || status !== user.status;

  async function save() {
    setPending(true); setError("");
    const changes: { role?: string; status?: string } = {};
    if (role !== user.role) changes.role = role;
    if (status !== user.status) changes.status = status;
    try {
      await api<User>(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setReview(false); setOpen(false); onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  return <Dialog open={open} onOpenChange={value => {
    if (pending) return;
    setOpen(value); setError(""); setReview(false);
    if (value) { setRole(user.role === "teacher" ? "teacher" : "student"); setStatus(user.status); }
  }}>
    <DialogTrigger render={<Button variant="outline" className="h-10" />}><Pencil />Chỉnh quyền</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Cập nhật tài khoản</DialogTitle><DialogDescription className="break-all">{user.full_name} · {user.email}</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); if (changed) { setError(""); setReview(true); } }} className="grid gap-4">
        <div className="field"><Label htmlFor={`${id}-role`}>Vai trò</Label><Select value={role} onValueChange={value => setRole(value ?? "student")} items={[{ value: "student", label: "Sinh viên" }, { value: "teacher", label: "Giảng viên" }]}><SelectTrigger id={`${id}-role`} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">Sinh viên</SelectItem><SelectItem value="teacher">Giảng viên</SelectItem></SelectContent></Select></div>
        <div className="field"><Label htmlFor={`${id}-status`}>Trạng thái tài khoản</Label><Select value={status} onValueChange={value => setStatus(value ?? "active")} items={[{ value: "active", label: "Hoạt động" }, { value: "locked", label: "Đã khóa" }]}><SelectTrigger id={`${id}-status`} className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Hoạt động</SelectItem><SelectItem value="locked">Đã khóa</SelectItem></SelectContent></Select></div>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Khóa tài khoản hoặc đổi vai trò sẽ thu hồi tất cả phiên đăng nhập. Môn học, lớp học và lịch sử được giữ lại.</p>
        <DialogFooter><Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>Hủy</Button><Button type="submit" className="h-11" disabled={!changed}>Xem thay đổi</Button></DialogFooter>
      </form>
      <AlertDialog open={review} onOpenChange={value => { if (!pending) setReview(value); }}><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <AlertDialogHeader><AlertDialogTitle>Xác nhận cập nhật tài khoản?</AlertDialogTitle><AlertDialogDescription className="break-words">Thay đổi áp dụng cho {user.full_name}. Người dùng cần đăng nhập lại sau khi bị khóa hoặc đổi vai trò; mở khóa không khôi phục phiên cũ.</AlertDialogDescription></AlertDialogHeader>
        <dl className="space-y-2 rounded-lg bg-muted p-3 text-sm">{role !== user.role && <div><dt className="text-muted-foreground">Vai trò</dt><dd>{roleLabel[user.role]} → {role === "teacher" ? "Giảng viên" : "Sinh viên"}</dd></div>}{status !== user.status && <div><dt className="text-muted-foreground">Trạng thái</dt><dd>{user.status === "active" ? "Hoạt động" : "Đã khóa"} → {status === "active" ? "Hoạt động" : "Đã khóa"}</dd></div>}</dl>
        <Feedback error={error} /><AlertDialogFooter><AlertDialogCancel disabled={pending}>Quay lại</AlertDialogCancel><Button variant={status === "locked" ? "destructive" : "default"} disabled={pending} onClick={save}>{pending && <LoaderCircle className="animate-spin" />}{pending ? "Đang lưu…" : "Xác nhận thay đổi"}</Button></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </DialogContent>
  </Dialog>;
}
