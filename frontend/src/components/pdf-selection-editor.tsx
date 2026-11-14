"use client";

import { useEffect, useId, useState } from "react";
import { BookOpen, GitBranch, Layers3, X } from "lucide-react";
import { toast } from "sonner";
import { Feedback, LoadingState, SubmitButton } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { listAll } from "@/lib/courses";
import { materialLabel, type MaterialKind, type MaterialSummary, type PDFSelection, type StudyMaterial } from "@/lib/study-materials";

export function PDFSelectionEditor({ documentId, documentTitle, selection, onClear, onSaved }: {
  documentId: string; documentTitle: string; selection: PDFSelection | null;
  onClear: () => void; onSaved: (material: StudyMaterial) => void;
}) {
  const [kind, setKind] = useState<MaterialKind | null>(null);
  const [pending, setPending] = useState(false);
  if (!selection) return <p className="text-xs text-muted-foreground">Bôi đen văn bản trong PDF để tạo Flashcard hoặc thêm nhánh sơ đồ, không cần AI.</p>;
  const tooLong = selection.text.length > 2000;
  return <>
    <div className="space-y-3 rounded-xl border border-primary/20 bg-accent/40 p-3" role="region" aria-label="Đoạn văn đã chọn">
      <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs font-medium text-primary"><BookOpen className="size-4" />Đã chọn ở trang {selection.page_number} · {selection.text.length} ký tự</p><Button variant="ghost" className="size-9" aria-label="Bỏ đoạn đã chọn" disabled={pending} onClick={onClear}><X /></Button></div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{selection.text}</p>
      {tooLong ? <p className="text-xs text-destructive">Đoạn chọn tối đa 2.000 ký tự. Hãy chọn một đoạn ngắn hơn.</p> : <div className="flex flex-wrap gap-2"><Button className="min-h-11" onClick={() => setKind("flashcards")}><Layers3 />Tạo Flashcard</Button><Button variant="outline" className="min-h-11" onClick={() => setKind("mindmap")}><GitBranch />Thêm vào sơ đồ</Button></div>}
    </div>
    <Dialog open={kind !== null} onOpenChange={open => { if (!open && !pending) setKind(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{kind === "flashcards" ? "Tạo thẻ từ đoạn đã chọn" : "Thêm đoạn chọn vào sơ đồ"}</DialogTitle><DialogDescription>Đoạn văn được lưu cùng số trang và kiểm tra với PDF gốc. Không gọi dịch vụ AI.</DialogDescription></DialogHeader>
        {kind && <SelectionForm key={kind} kind={kind} documentId={documentId} documentTitle={documentTitle} selection={selection} onPending={setPending} onClose={() => setKind(null)} onSaved={value => { setKind(null); onClear(); onSaved(value); toast.success("Đã lưu học liệu từ đoạn đã chọn."); }} />}
      </DialogContent>
    </Dialog>
  </>;
}

function SelectionForm({ kind, documentId, documentTitle, selection, onPending, onClose, onSaved }: {
  kind: MaterialKind; documentId: string; documentTitle: string; selection: PDFSelection;
  onPending: (value: boolean) => void; onClose: () => void; onSaved: (value: StudyMaterial) => void;
}) {
  const id = useId();
  const [items, setItems] = useState<MaterialSummary[]>();
  const [target, setTarget] = useState("new");
  const [detail, setDetail] = useState<StudyMaterial>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    listAll<MaterialSummary>(`/documents/${documentId}/study-materials?kind=${kind}`, controller.signal).then(
      value => { if (!controller.signal.aborted) setItems(value); },
      err => { if (!controller.signal.aborted) setError(errorMessage(err)); },
    );
    return () => controller.abort();
  }, [documentId, kind]);
  useEffect(() => {
    if (target === "new" || kind !== "mindmap") return;
    const controller = new AbortController();
    api<StudyMaterial>(`/study-materials/${target}`, { signal: controller.signal }).then(
      value => { if (!controller.signal.aborted) { setDetail(value); setError(""); } },
      err => { if (!controller.signal.aborted) setError(errorMessage(err)); },
    );
    return () => controller.abort();
  }, [target, kind]);
  const ready = !!items && (kind !== "mindmap" || target === "new" || detail?.id === target);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !ready) return;
    const form = new FormData(event.currentTarget);
    setPending(true); onPending(true); setError("");
    try {
      onSaved(await api<StudyMaterial>(`/documents/${documentId}/study-materials/from-selection`, {
        method: "POST", body: JSON.stringify({ kind, selection, label: String(form.get("label")).trim(),
          ...(target === "new" ? { title: String(form.get("title")).trim() } : { material_id: target }),
          ...(kind === "mindmap" && target !== "new" ? { parent_id: form.get("parent_id") } : {}),
        }),
      }));
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); onPending(false); }
  }
  return <form onSubmit={save} className="space-y-4">
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <div className="field"><Label htmlFor={`${id}-target`}>Lưu vào {materialLabel[kind]}</Label><Select value={target} onValueChange={value => { if (value) { setTarget(value); setError(""); } }} items={[{ value: "new", label: `Tạo ${materialLabel[kind]} mới` }, ...(items ?? []).map(item => ({ value: item.id, label: item.title }))]}><SelectTrigger id={`${id}-target`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Tạo {materialLabel[kind]} mới</SelectItem>{items?.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div>
      {target === "new" && <div className="field"><Label htmlFor={`${id}-title`}>Tên {materialLabel[kind]}</Label><Input id={`${id}-title`} name="title" required maxLength={200} defaultValue={documentTitle.slice(0, 200)} className="min-h-11" /></div>}
      <div className="field"><Label htmlFor={`${id}-label`}>{kind === "flashcards" ? "Câu hỏi ở mặt trước" : "Tên nhánh mới"}</Label><Input id={`${id}-label`} name="label" required maxLength={200} placeholder={kind === "flashcards" ? "Đặt câu hỏi cho đoạn văn đã chọn…" : "Đặt tên ngắn gọn cho nhánh…"} className="min-h-11" /></div>
      {kind === "mindmap" && target !== "new" && detail?.id === target && <div className="field"><Label htmlFor={`${id}-parent`}>Thêm vào nhánh</Label><Select key={target} name="parent_id" defaultValue={detail.content.nodes.find(node => node.parent_id === null)?.id} items={detail.content.nodes.map(node => ({ value: node.id, label: node.label }))}><SelectTrigger id={`${id}-parent`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{detail.content.nodes.map(node => <SelectItem key={node.id} value={node.id}>{node.label}</SelectItem>)}</SelectContent></Select></div>}
      <div className="space-y-2 rounded-lg bg-muted/50 p-3"><p className="text-xs font-medium text-primary">{kind === "flashcards" ? "Mặt sau · Trả lời" : "Ghi chú nhánh"} · Trang {selection.page_number}</p><p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{selection.text}</p></div>
    </fieldset>
    {!ready && !error && <LoadingState />}
    <Feedback error={error} />
    <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Hủy</Button>{ready && <SubmitButton pending={pending}>{kind === "flashcards" ? "Lưu Flashcard" : "Thêm nhánh"}</SubmitButton>}</DialogFooter>
  </form>;
}
