"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Feedback, SubmitButton } from "@/components/feedback";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import type { Chapter, Classroom, Course, Topic } from "@/lib/courses";

function Editor({ title, description, editing, children, save, onSaved }: {
  title: string; description: string; editing?: boolean; children: React.ReactNode;
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
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-5"><fieldset disabled={pending} className="grid min-w-0 gap-5">{children}</fieldset><Feedback error={error} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => setOpen(false)}>Hủy</Button><SubmitButton pending={pending}>{editing ? "Lưu thay đổi" : "Tạo mới"}</SubmitButton></div></form>
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

function TitleField({ value, label = "Tên" }: { value?: string; label?: string }) {
  return <div className="field"><Label htmlFor="entity-title">{label}</Label><Input id="entity-title" name="title" required maxLength={200} defaultValue={value} className="app-input" placeholder="Nhập tên rõ ràng, dễ nhận biết" /></div>;
}
function DescriptionField({ value }: { value?: string | null }) {
  return <div className="field"><Label htmlFor="entity-description">Mô tả <span className="font-normal text-muted-foreground">(không bắt buộc)</span></Label><Textarea id="entity-description" name="description" maxLength={5000} defaultValue={value ?? ""} className="min-h-24" placeholder="Một vài dòng về nội dung…" /></div>;
}
const fields = (form: FormData) => ({ title: String(form.get("title")).trim(), description: String(form.get("description") ?? "").trim() || null });

export function CourseEditor({ course, role, onSaved }: { course?: Course; role: "student" | "teacher"; onSaved: () => void }) {
  return <Editor title={course ? "Sửa môn học" : "Tạo môn học"} description={role === "teacher" ? "Tổ chức nội dung giảng dạy trước khi tạo lớp học." : "Tạo một không gian riêng để sắp xếp kiến thức của bạn."} editing={!!course} onSaved={onSaved} save={form => api(course ? `/courses/${course.id}` : "/courses", {
    method: course ? "PATCH" : "POST", body: JSON.stringify({ ...fields(form), ...(!course ? { kind: role === "teacher" ? "teaching" : "personal" } : {}) }),
  })}><TitleField value={course?.title} label="Tên môn học" /><DescriptionField value={course?.description} /></Editor>;
}

export function ChapterEditor({ courseId, chapter, onSaved }: { courseId: string; chapter?: Chapter; onSaved: () => void }) {
  return <Editor title={chapter ? "Sửa chương" : "Thêm chương"} description="Chia nội dung môn học thành các phần có thứ tự." editing={!!chapter} onSaved={onSaved} save={form => api(`/courses/${courseId}/chapters${chapter ? `/${chapter.id}` : ""}`, {
    method: chapter ? "PATCH" : "POST", body: JSON.stringify({ title: String(form.get("title")).trim(), position: Number(form.get("position")) }),
  })}><TitleField value={chapter?.title} label="Tên chương" /><div className="field"><Label htmlFor="position">Thứ tự sắp xếp</Label><Input id="position" name="position" type="number" min={0} step={1} required defaultValue={chapter?.position ?? 0} className="app-input" /><p className="text-xs text-muted-foreground">Số nhỏ hơn được hiển thị trước, bắt đầu từ 0.</p></div></Editor>;
}

export function TopicEditor({ courseId, topic, chapters, onSaved }: { courseId: string; topic?: Topic; chapters: Chapter[]; onSaved: () => void }) {
  return <Editor title={topic ? "Sửa chủ đề" : "Thêm chủ đề"} description="Chủ đề có thể thuộc một chương hoặc để độc lập trong môn học." editing={!!topic} onSaved={onSaved} save={form => api(`/courses/${courseId}/topics${topic ? `/${topic.id}` : ""}`, {
    method: topic ? "PATCH" : "POST", body: JSON.stringify({ ...fields(form), chapter_id: form.get("chapter_id") === "none" ? null : form.get("chapter_id") }),
  })}><TitleField value={topic?.title} label="Tên chủ đề" /><div className="field"><Label htmlFor="chapter-select">Thuộc chương</Label><Select name="chapter_id" defaultValue={topic?.chapter_id ?? "none"} items={[{ value: "none", label: "Không thuộc chương" }, ...chapters.map(c => ({ value: c.id, label: c.title }))]}><SelectTrigger id="chapter-select" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Không thuộc chương</SelectItem>{chapters.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div><DescriptionField value={topic?.description} /></Editor>;
}

export function ClassroomEditor({ courseId, classroom, onSaved }: { courseId: string; classroom?: Classroom; onSaved: () => void }) {
  return <Editor title={classroom ? "Sửa tên lớp" : "Tạo lớp học"} description="Lớp học thuộc môn giảng dạy. Bạn có thể tạo mã tham gia sau khi tạo lớp." editing={!!classroom} onSaved={onSaved} save={form => api(classroom ? `/classrooms/${classroom.id}` : `/courses/${courseId}/classrooms`, {
    method: classroom ? "PATCH" : "POST", body: JSON.stringify({ title: String(form.get("title")).trim() }),
  })}><TitleField value={classroom?.title} label="Tên lớp học" /></Editor>;
}
