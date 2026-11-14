"use client";

import { useId, useState } from "react";
import { FileUp, LoaderCircle, Pencil } from "lucide-react";
import { Feedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import type { Chapter, Classroom, Course } from "@/lib/courses";
import { documentMaxSize, formatFileSize, type StudyDocument } from "@/lib/documents";

export function DocumentForm({ course, chapters, classrooms, classroomId, document, onSaved, disabled }: {
  course: Course; chapters: Chapter[]; classrooms: Classroom[]; classroomId?: string;
  document?: StudyDocument; onSaved: (document: StudyDocument) => void; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(document?.title ?? "");
  const [titleEdited, setTitleEdited] = useState(false);
  const [chapter, setChapter] = useState(document?.chapter_id ?? "none");
  const [classroom, setClassroom] = useState(classroomId ?? classrooms[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);

  function changeOpen(value: boolean) {
    if (pending) return;
    setOpen(value); setError("");
    if (value) {
      setTitle(document?.title ?? "");
      setTitleEdited(false);
      setChapter(document?.chapter_id ?? "none");
      setClassroom(classroomId ?? classrooms[0]?.id ?? "");
      setFile(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!title.trim()) { setError("Vui lòng nhập tên tài liệu."); return; }
    if (!document && (!file || !file.name.toLowerCase().endsWith(".pdf"))) {
      setError("Vui lòng chọn một file PDF."); return;
    }
    if (!document && file && file.size > documentMaxSize) {
      setError("File vượt dung lượng tối đa 20 MiB."); return;
    }
    if (!document && course.kind === "teaching" && !classroom) {
      setError("Vui lòng chọn lớp học nhận tài liệu."); return;
    }
    setPending(true);
    try {
      let result: StudyDocument;
      if (document) {
        result = await api<StudyDocument>(`/documents/${document.id}`, {
          method: "PATCH", body: JSON.stringify({ title: title.trim(), chapter_id: chapter === "none" ? null : chapter }),
        });
      } else {
        const body = new FormData();
        body.append("file", file!);
        body.append("title", title.trim());
        if (chapter !== "none") body.append("chapter_id", chapter);
        if (course.kind === "teaching") body.append("classroom_id", classroom);
        result = await api<StudyDocument>(`/courses/${course.id}/documents`, { method: "POST", body });
      }
      setOpen(false); onSaved(result);
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button variant={document ? "outline" : "default"} className="h-10" disabled={disabled} />}>
      {document ? <Pencil /> : <FileUp />}{document ? "Sửa tài liệu" : "Tải PDF lên"}
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><FileUp className="mb-1 size-6 text-primary" aria-hidden="true" /><DialogTitle>{document ? "Sửa thông tin tài liệu" : "Thêm tài liệu PDF"}</DialogTitle>
        <DialogDescription>{document ? "Đổi tên hoặc sắp xếp tài liệu vào chương. Môn học, lớp và file gốc được giữ nguyên." : "PDF có văn bản hoặc bản scan, tối đa 20 MiB và 500 trang. Bản scan được nhận dạng chữ tự động, có thể mất thêm thời gian. Chưa hỗ trợ PDF khóa mật khẩu."}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="grid gap-4">
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
          {!document && <div className="field"><Label htmlFor={`${id}-file`}>File PDF</Label>
            <Input id={`${id}-file`} type="file" accept=".pdf,application/pdf" required className="h-auto min-h-11 bg-card py-2" onChange={event => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected); setError("");
              if (!titleEdited || !title.trim()) setTitle(selected?.name.replace(/\.pdf$/i, "").slice(0, 200) ?? "");
            }} />
            {file && <p className="break-all text-xs text-muted-foreground">{file.name} · {formatFileSize(file.size)}</p>}
          </div>}
          <div className="field"><Label htmlFor={`${id}-title`}>Tên tài liệu</Label><Input id={`${id}-title`} required maxLength={200} value={title} onChange={event => { setTitle(event.target.value); setTitleEdited(Boolean(event.target.value.trim())); }} className="app-input" /></div>
          {!document && course.kind === "teaching" && !classroomId && <div className="field"><Label htmlFor={`${id}-classroom`}>Lớp nhận tài liệu</Label>
            <Select value={classroom} onValueChange={value => setClassroom(value ?? "")} items={classrooms.map(item => ({ value: item.id, label: item.title }))}>
              <SelectTrigger id={`${id}-classroom`} className="h-11 w-full"><SelectValue placeholder="Chọn lớp học" /></SelectTrigger>
              <SelectContent>{classrooms.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          <div className="field"><Label htmlFor={`${id}-chapter`}>Thuộc chương</Label>
            <Select value={chapter} onValueChange={value => setChapter(value ?? "none")} items={[{ value: "none", label: "Không thuộc chương" }, ...chapters.map(item => ({ value: item.id, label: item.title }))]}>
              <SelectTrigger id={`${id}-chapter`} className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Không thuộc chương</SelectItem>{chapters.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!document && course.kind === "teaching" && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Tài liệu mới chỉ hiển thị với bạn. Công bố sau khi kiểm tra để sinh viên trong lớp có thể đọc.</p>}
        </fieldset>
        <Feedback error={error} />
        <DialogFooter><Button type="button" variant="outline" className="h-11" disabled={pending} onClick={() => changeOpen(false)}>Hủy</Button>
          <Button type="submit" className="h-11" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />}{pending ? (document ? "Đang lưu…" : "Đang tải lên…") : document ? "Lưu thay đổi" : "Tải lên"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
