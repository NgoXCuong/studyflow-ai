"use client";

import { useId, useState } from "react";
import { Layers3, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Feedback, SubmitButton } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { materialLabel, type MaterialContent, type MaterialKind, type StudyMaterial } from "@/lib/study-materials";

export function StudyMaterialEditor({ documentId, kind, ready, material, onSaved }: {
  documentId: string; kind: MaterialKind; ready: boolean; material?: StudyMaterial; onSaved: (value: StudyMaterial) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
    <DialogTrigger render={<Button variant={material ? "outline" : "default"} className="min-h-11" />}>
      {material ? <Pencil /> : <Plus />}{material ? "Chỉnh sửa" : `Tạo ${materialLabel[kind]}`}
    </DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!pending}>
      <DialogHeader><Layers3 className="size-6 text-primary" /><DialogTitle>{material ? "Chỉnh sửa" : "Tạo"} {materialLabel[kind]}</DialogTitle><DialogDescription>Học liệu riêng của bạn trong tài liệu này. Nội dung AI cần được đối chiếu với nguồn trước khi học.</DialogDescription></DialogHeader>
      {open && <EditorForm documentId={documentId} kind={kind} ready={ready} material={material} onPending={setPending} onClose={() => setOpen(false)} onSaved={value => { onSaved(value); setOpen(false); }} />}
    </DialogContent>
  </Dialog>;
}

function EditorForm({ documentId, kind, ready, material, onPending, onClose, onSaved }: {
  documentId: string; kind: MaterialKind; ready: boolean; material?: StudyMaterial;
  onPending: (value: boolean) => void; onClose: () => void; onSaved: (value: StudyMaterial) => void;
}) {
  const id = useId();
  const [mode, setMode] = useState(material || !ready ? "manual" : "ai");
  const [content, setContent] = useState<MaterialContent>(() => material?.content ?? (kind === "flashcards"
    ? { cards: [{ front: "", back: "", source_ids: [], known: false }], nodes: [] }
    : { cards: [], nodes: [{ id: "root", parent_id: null, label: "", note: "", source_ids: [] }] }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); onPending(true); setError("");
    const body = { kind, title: String(form.get("title")).trim(), ...(mode === "ai" ? { count: Number(form.get("count")) } : { content }) };
    try {
      onSaved(await api<StudyMaterial>(material ? `/study-materials/${material.id}` : `/documents/${documentId}/study-materials${mode === "ai" ? "/generate" : ""}`, {
        method: material ? "PUT" : "POST", body: JSON.stringify(body),
      }));
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); onPending(false); }
  }
  return <form onSubmit={save} className="space-y-5">
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <div className="field"><Label htmlFor={`${id}-title`}>Tên {materialLabel[kind]}</Label><Input id={`${id}-title`} name="title" defaultValue={material?.title} required maxLength={200} placeholder="Ví dụ: Kiến thức chương 1" className="min-h-11" /></div>
      {!material && <div className="field"><Label htmlFor={`${id}-mode`}>Cách tạo</Label><Select value={mode} onValueChange={value => setMode(value ?? "manual")} items={[{ value: "ai", label: "Tạo bằng AI từ tài liệu" }, { value: "manual", label: "Tự nhập nội dung" }]}><SelectTrigger id={`${id}-mode`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ai" disabled={!ready}>Tạo bằng AI từ tài liệu</SelectItem><SelectItem value="manual">Tự nhập nội dung</SelectItem></SelectContent></Select>{!ready && <p className="text-xs text-muted-foreground">AI khả dụng khi tài liệu xử lý xong. Bạn vẫn có thể tạo thủ công.</p>}</div>}
      {mode === "ai" ? <div className="space-y-3"><div className="field"><Label htmlFor={`${id}-count`}>{kind === "flashcards" ? "Số thẻ" : "Số nút (gồm nút gốc)"}</Label><Input id={`${id}-count`} name="count" type="number" required min={1} max={kind === "flashcards" ? 50 : 30} defaultValue={5} className="min-h-11" /></div><p className="text-xs text-muted-foreground">Tối đa {kind === "flashcards" ? "50 thẻ" : "30 nút"}. Yêu cầu lớn được chia thành nhiều lượt, tối đa 5 thẻ/nút mỗi lượt; có thể mất nhiều thời gian hơn.</p><p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><Sparkles className="mt-1 size-4 shrink-0 text-primary" />AI sử dụng các đoạn được chọn từ tài liệu, không đảm bảo bao quát toàn bộ nội dung. Bạn có thể sửa kết quả sau khi tạo.</p></div>
        : kind === "flashcards" ? <div className="space-y-4">
          {content.cards.map((card, index) => <section key={index} className="space-y-3 border-t pt-4" aria-label={`Thẻ ${index + 1}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">Thẻ {index + 1}</h3><Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Xóa thẻ ${index + 1}`} disabled={content.cards.length === 1} onClick={() => setContent(current => ({ ...current, cards: current.cards.filter((_, i) => i !== index) }))}><Trash2 /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2">{(["front", "back"] as const).map(side => <div key={side} className="field"><Label htmlFor={`${id}-${side}-${index}`}>{side === "front" ? "Mặt trước · Câu hỏi" : "Mặt sau · Trả lời"}</Label><Textarea id={`${id}-${side}-${index}`} value={card[side]} required maxLength={2000} onChange={event => setContent(current => ({ ...current, cards: current.cards.map((item, i) => i === index ? { ...item, [side]: event.target.value, known: false } : item) }))} /></div>)}</div>
          </section>)}
          <Button type="button" variant="outline" className="min-h-11" disabled={content.cards.length >= 50} onClick={() => setContent(current => ({ ...current, cards: [...current.cards, { front: "", back: "", source_ids: [], known: false }] }))}><Plus />Thêm thẻ</Button>
        </div> : <div className="space-y-4">
          {content.nodes.map((node, index) => <section key={node.id} className="space-y-3 border-t pt-4" aria-label={`Nút ${index + 1}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{node.parent_id === null ? "Chủ đề trung tâm" : `Nhánh ${index + 1}`}</h3><Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Xóa nút ${index + 1}`} disabled={node.parent_id === null || content.nodes.some(item => item.parent_id === node.id)} onClick={() => setContent(current => ({ ...current, nodes: current.nodes.filter(item => item.id !== node.id) }))}><Trash2 /></Button></div>
            <div className="field"><Label htmlFor={`${id}-label-${index}`}>Tên chủ đề</Label><Input id={`${id}-label-${index}`} required maxLength={200} value={node.label} className="min-h-11" onChange={event => setContent(current => ({ ...current, nodes: current.nodes.map(item => item.id === node.id ? { ...item, label: event.target.value } : item) }))} /></div>
            {node.parent_id !== null && <div className="field"><Label htmlFor={`${id}-parent-${index}`}>Thuộc nhánh</Label><Select value={node.parent_id} onValueChange={value => { if (value) setContent(current => ({ ...current, nodes: current.nodes.map(item => item.id === node.id ? { ...item, parent_id: value } : item) })); }} items={content.nodes.filter(item => item.id !== node.id).map(item => ({ value: item.id, label: item.label || "Chưa đặt tên" }))}><SelectTrigger id={`${id}-parent-${index}`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{content.nodes.filter(item => item.id !== node.id).map(item => <SelectItem key={item.id} value={item.id}>{item.label || "Chưa đặt tên"}</SelectItem>)}</SelectContent></Select></div>}
            <div className="field"><Label htmlFor={`${id}-note-${index}`}>Ghi chú (không bắt buộc)</Label><Textarea id={`${id}-note-${index}`} maxLength={2000} value={node.note} onChange={event => setContent(current => ({ ...current, nodes: current.nodes.map(item => item.id === node.id ? { ...item, note: event.target.value } : item) }))} /></div>
          </section>)}
          <p className="text-xs text-muted-foreground">Xóa các nhánh con trước khi xóa nhánh cha. Các nhánh phải nối về chủ đề trung tâm và không tạo vòng lặp.</p>
          <Button type="button" variant="outline" className="min-h-11" disabled={content.nodes.length >= 30} onClick={() => setContent(current => ({ ...current, nodes: [...current.nodes, { id: crypto.randomUUID(), parent_id: current.nodes.find(node => node.parent_id === null)!.id, label: "", note: "", source_ids: [] }] }))}><Plus />Thêm nhánh</Button>
        </div>}
    </fieldset>
    <Feedback error={error} />
    {pending && mode === "ai" && <p role="status" className="text-sm text-muted-foreground">Đang tạo và ghép nội dung theo từng lượt nhỏ. Vui lòng giữ cửa sổ này mở…</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Hủy</Button><SubmitButton pending={pending}>{material ? "Lưu thay đổi" : mode === "ai" ? "Tạo bằng AI" : "Lưu học liệu"}</SubmitButton></DialogFooter>
  </form>;
}
