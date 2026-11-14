"use client";

import { useId, useState } from "react";
import { BookOpen, Layers3, Plus, Pencil, Tags, Trash2, Users, type LucideIcon } from "lucide-react";
import { Feedback, SubmitButton } from "@/components/feedback";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import type { Chapter, Classroom, Course, Topic } from "@/lib/courses";

function Editor({ title, description, icon: Icon, editing, children, save, onSaved }: {
  title: string; description: string; icon: LucideIcon; editing?: boolean; children: React.ReactNode;
  save: (form: FormData) => Promise<unknown>; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try { await save(new FormData(event.currentTarget)); setOpen(false); onSaved(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(""); } }}>
    <DialogTrigger render={<Button variant={editing ? "outline" : "default"} className="h-10" />}>{editing ? <Pencil /> : <Plus />}{title}</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
      <DialogHeader>
        <div className="mb-1 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
          <div><p className="mb-0.5 text-xs font-medium text-primary">{editing ? "Chỉnh sửa thông tin" : "Sắp xếp không gian học tập"}</p><DialogTitle>{title}</DialogTitle></div>
        </div>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="grid gap-5">
        <fieldset disabled={pending} className="grid min-w-0 gap-5">{children}</fieldset>
        <Feedback error={error} />
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Hủy</Button><SubmitButton pending={pending}>{editing ? "Lưu thay đổi" : title}</SubmitButton></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ConfirmAction({ label = "Xóa", title, description, action, onDone, variant = "destructive", icon = <Trash2 />, confirmVariant = "destructive" }: {
  label?: string; title: string; description: string; action: () => Promise<unknown>; onDone: () => void; variant?: "destructive" | "outline"; icon?: React.ReactNode; confirmVariant?: "default" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setPending(true); setError("");
    try { await action(); setOpen(false); onDone(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(""); } }}><AlertDialogTrigger render={<Button variant={variant} className="h-10" />}>{icon}{label}</AlertDialogTrigger><AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md"><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription className="break-words">{description}</AlertDialogDescription></AlertDialogHeader><Feedback error={error} /><AlertDialogFooter><AlertDialogCancel disabled={pending}>Hủy</AlertDialogCancel><Button variant={confirmVariant} disabled={pending} onClick={confirm}>{pending ? "Đang xử lý…" : label}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function TitleField({ value, label = "Tên", placeholder }: { value?: string; label?: string; placeholder: string }) {
  const id = useId();
  return <div className="field"><Label htmlFor={id}>{label} <span className="text-primary" aria-hidden="true">*</span></Label><Input id={id} name="title" required maxLength={200} defaultValue={value} className="app-input" placeholder={placeholder} /><p className="text-xs text-muted-foreground">Bắt buộc · Tối đa 200 ký tự.</p></div>;
}
function DescriptionField({ value }: { value?: string | null }) {
  const id = useId();
  return <div className="field"><Label htmlFor={id}>Mô tả <span className="font-normal text-muted-foreground">(không bắt buộc)</span></Label><Textarea id={id} name="description" maxLength={5000} defaultValue={value ?? ""} className="min-h-28 resize-y leading-relaxed" placeholder="Nội dung chính, mục tiêu học tập hoặc ghi chú cần nhớ…" /><p className="text-xs text-muted-foreground">Một vài dòng ngắn để dễ nhận biết nội dung khi quay lại học.</p></div>;
}
const fields = (form: FormData) => ({ title: String(form.get("title")).trim(), description: String(form.get("description") ?? "").trim() || null });

export function CourseEditor({ course, role, onSaved }: { course?: Course; role: "student" | "teacher"; onSaved: () => void }) {
  return <Editor icon={BookOpen} title={course ? "Sửa môn học" : "Tạo môn học"} description={role === "teacher" ? "Tổ chức nội dung giảng dạy trước khi tạo lớp học." : "Tạo một không gian riêng để sắp xếp kiến thức của bạn."} editing={!!course} onSaved={onSaved} save={form => api(course ? `/courses/${course.id}` : "/courses", {
    method: course ? "PATCH" : "POST", body: JSON.stringify({ ...fields(form), ...(!course ? { kind: role === "teacher" ? "teaching" : "personal" } : {}) }),
  })}><TitleField value={course?.title} label="Tên môn học" placeholder="Ví dụ: Cơ sở dữ liệu" /><DescriptionField value={course?.description} /></Editor>;
}

export function ChapterEditor({ courseId, chapter, onSaved }: { courseId: string; chapter?: Chapter; onSaved: () => void }) {
  return <Editor icon={Layers3} title={chapter ? "Sửa chương" : "Thêm chương"} description="Chia nội dung môn học thành các phần có thứ tự." editing={!!chapter} onSaved={onSaved} save={form => api(`/courses/${courseId}/chapters${chapter ? `/${chapter.id}` : ""}`, {
    method: chapter ? "PATCH" : "POST", body: JSON.stringify({ title: String(form.get("title")).trim(), position: Number(form.get("position")) }),
  })}><TitleField value={chapter?.title} label="Tên chương" placeholder="Ví dụ: Chương 1 — Tổng quan" /><div className="field"><Label htmlFor="position">Thứ tự sắp xếp</Label><Input id="position" name="position" type="number" min={0} step={1} required defaultValue={chapter?.position ?? 0} className="app-input" /><p className="text-xs text-muted-foreground">Số nhỏ hơn được hiển thị trước, bắt đầu từ 0.</p></div></Editor>;
}

export function TopicEditor({ courseId, topic, chapters, onSaved }: { courseId: string; topic?: Topic; chapters: Chapter[]; onSaved: () => void }) {
  return <Editor icon={Tags} title={topic ? "Sửa chủ đề" : "Thêm chủ đề"} description="Chủ đề có thể thuộc một chương hoặc để độc lập trong môn học." editing={!!topic} onSaved={onSaved} save={form => api(`/courses/${courseId}/topics${topic ? `/${topic.id}` : ""}`, {
    method: topic ? "PATCH" : "POST", body: JSON.stringify({ ...fields(form), chapter_id: form.get("chapter_id") === "none" ? null : form.get("chapter_id") }),
  })}><TitleField value={topic?.title} label="Tên chủ đề" placeholder="Ví dụ: Mô hình dữ liệu quan hệ" /><div className="field"><Label htmlFor="chapter-select">Thuộc chương</Label><Select name="chapter_id" defaultValue={topic?.chapter_id ?? "none"} items={[{ value: "none", label: "Không thuộc chương" }, ...chapters.map(c => ({ value: c.id, label: c.title }))]}><SelectTrigger id="chapter-select" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không thuộc chương</SelectItem>{chapters.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div><DescriptionField value={topic?.description} /></Editor>;
}

export function ClassroomEditor({ courseId, classroom, onSaved }: { courseId: string; classroom?: Classroom; onSaved: () => void }) {
  return <Editor icon={Users} title={classroom ? "Sửa tên lớp" : "Tạo lớp học"} description="Lớp học thuộc môn giảng dạy. Bạn có thể tạo mã tham gia sau khi tạo lớp." editing={!!classroom} onSaved={onSaved} save={form => api(classroom ? `/classrooms/${classroom.id}` : `/courses/${courseId}/classrooms`, {
    method: classroom ? "PATCH" : "POST", body: JSON.stringify({ title: String(form.get("title")).trim() }),
  })}><TitleField value={classroom?.title} label="Tên lớp học" placeholder="Ví dụ: Cơ sở dữ liệu — Nhóm 01" /></Editor>;
}
