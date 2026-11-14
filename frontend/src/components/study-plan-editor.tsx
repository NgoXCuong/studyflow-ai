"use client";

import { useId, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { Feedback, SubmitButton } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import type { Course } from "@/lib/courses";
import { vietnamInputTime, type StudyPlan } from "@/lib/study-plans";

export function StudyPlanEditor({ courses, plan, initialCourseId, onSaved }: { courses: Course[]; plan?: StudyPlan; initialCourseId?: string; onSaved: (plan: StudyPlan) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
    <DialogTrigger render={<Button variant={plan ? "ghost" : "default"} className="min-h-11" disabled={!courses.length} />}>{plan ? <Pencil /> : <Plus />}{plan ? "Sửa thiết lập" : "Tạo kế hoạch"}</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!pending}>
      <DialogHeader><CalendarDays className="mb-1 size-6 text-primary" aria-hidden="true" /><DialogTitle>{plan ? "Điều chỉnh kế hoạch ôn tập" : "Lên lịch cho mục tiêu của bạn"}</DialogTitle><DialogDescription>Giờ Việt Nam (UTC+7). Chỉ xếp lịch trước ngày thi; giữ nguyên nhiệm vụ đã hoàn thành. Thời lượng là dự kiến, không giới hạn thời gian làm quiz.</DialogDescription></DialogHeader>
      {open && <PlanForm courses={courses} plan={plan} initialCourseId={initialCourseId} onPending={setPending} onSaved={value => { onSaved(value); setOpen(false); }} onClose={() => setOpen(false)} />}
    </DialogContent>
  </Dialog>;
}

function PlanForm({ courses, plan, initialCourseId, onPending, onSaved, onClose }: { courses: Course[]; plan?: StudyPlan; initialCourseId?: string; onPending: (pending: boolean) => void; onSaved: (plan: StudyPlan) => void; onClose: () => void }) {
  const id = useId();
  const [courseId, setCourseId] = useState(plan?.course_id ?? courses.find(course => course.id === initialCourseId)?.id ?? courses[0]?.id ?? "");
  const [examDate, setExamDate] = useState(plan?.exam_date ?? "");
  const [slots, setSlots] = useState(() => plan?.availability.map(slot => ({ start_at: vietnamInputTime(slot.start_at), end_at: vietnamInputTime(slot.end_at) })) ?? [{ start_at: "", end_at: "" }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); onPending(true); setError("");
    const body = { goal: String(form.get("goal")).trim(), exam_date: examDate,
      availability: slots.map(slot => ({ start_at: `${slot.start_at}:00+07:00`, end_at: `${slot.end_at}:00+07:00` })),
      read_minutes: Number(form.get("read_minutes")), quiz_minutes: Number(form.get("quiz_minutes")), review_minutes: Number(form.get("review_minutes")),
      ...(!plan ? { course_id: courseId } : {}),
    };
    try { onSaved(await api<StudyPlan>(plan ? `/study-plans/${plan.id}` : "/study-plans", { method: plan ? "PUT" : "POST", body: JSON.stringify(body) })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); onPending(false); }
  }
  return <form onSubmit={save} className="space-y-5">
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field"><Label htmlFor={`${id}-course`}>Môn cần ôn</Label><Select value={courseId} onValueChange={value => { if (value) setCourseId(value); }} disabled={!!plan} items={courses.map(course => ({ value: course.id, label: course.title }))}><SelectTrigger id={`${id}-course`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{courses.map(course => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div>
        <div className="field"><Label htmlFor={`${id}-exam`}>Ngày thi</Label><Input id={`${id}-exam`} type="date" value={examDate} onChange={event => setExamDate(event.target.value)} required className="min-h-11" /></div>
      </div>
      <div className="field"><Label htmlFor={`${id}-goal`}>Mục tiêu ôn tập</Label><Textarea id={`${id}-goal`} name="goal" required maxLength={2000} defaultValue={plan?.goal} placeholder="Ví dụ: củng cố các chủ đề cần ôn trước kỳ thi…" /></div>
      <section className="space-y-3 border-t pt-4" aria-label="Thời gian rảnh">
        <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-primary" />Khoảng thời gian có thể học</h3>
        <p className="text-sm text-muted-foreground">Nhập từng khoảng rảnh cụ thể. Các khoảng không được trùng nhau và phải kết thúc trước 00:00 ngày thi. Nhiệm vụ được xếp trọn trong một khoảng.</p>
        {slots.map((slot, index) => <div key={index} className="grid min-w-0 items-end gap-3 border-b pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="field min-w-0"><Label htmlFor={`${id}-start-${index}`}>Bắt đầu {index + 1}</Label><Input id={`${id}-start-${index}`} type="datetime-local" className="min-h-11 min-w-0" value={slot.start_at} required onChange={event => setSlots(current => current.map((item, row) => row === index ? { ...item, start_at: event.target.value } : item))} /></div>
          <div className="field min-w-0"><Label htmlFor={`${id}-end-${index}`}>Kết thúc {index + 1}</Label><Input id={`${id}-end-${index}`} type="datetime-local" className="min-h-11 min-w-0" value={slot.end_at} required onChange={event => setSlots(current => current.map((item, row) => row === index ? { ...item, end_at: event.target.value } : item))} /></div>
          <Button type="button" variant="ghost" className="size-11" aria-label={`Xóa khoảng ${index + 1}`} disabled={slots.length === 1} onClick={() => setSlots(current => current.filter((_, row) => row !== index))}><Trash2 /></Button>
        </div>)}
        <Button type="button" variant="outline" className="min-h-11" disabled={slots.length >= 200} onClick={() => setSlots(current => [...current, { start_at: "", end_at: "" }])}><Plus />Thêm khoảng rảnh</Button>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">{[{ field: "read_minutes", label: "Đọc tài liệu", value: plan?.read_minutes ?? 20 }, { field: "quiz_minutes", label: "Luyện quiz", value: plan?.quiz_minutes ?? 20 }, { field: "review_minutes", label: "Kiểm tra lại", value: plan?.review_minutes ?? 15 }].map(item => <div key={item.field} className="field"><Label htmlFor={`${id}-${item.field}`}>{item.label} (phút)</Label><Input id={`${id}-${item.field}`} name={item.field} type="number" min={1} max={1440} step={1} required defaultValue={item.value} className="min-h-11" /></div>)}</div>
    </fieldset>
    <Feedback error={error} />
    <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={pending}>Hủy</Button><SubmitButton pending={pending}>{plan ? "Lưu & xếp lại phần chưa hoàn thành" : "Tạo lịch ôn tập"}</SubmitButton></DialogFooter>
  </form>;
}
