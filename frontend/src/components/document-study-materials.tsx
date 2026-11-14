"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ExternalLink, GitBranch, Layers3, RotateCw } from "lucide-react";
import { EmptyState, ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { StudyMaterialEditor } from "@/components/study-material-editor";
import { ConfirmAction } from "@/components/study-forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";
import { materialLabel, type MaterialKind, type MaterialSummary, type MindNode, type PDFSelection, type StudyMaterial } from "@/lib/study-materials";

export function DocumentStudyMaterials({ documentId, kind, ready, preview, focused }: {
  documentId: string; kind: MaterialKind; ready: boolean; preview: string; focused?: MaterialSummary;
}) {
  const id = useId();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(focused?.id ?? null);
  const list = useResource<MaterialSummary[]>(`/documents/${documentId}/study-materials?kind=${kind}&limit=21&offset=${page * 20}`);
  const selectedId = selected ?? list.data?.[0]?.id;
  const options = [...(focused && selectedId === focused.id && !list.data?.slice(0, 20).some(item => item.id === focused.id) ? [focused] : []), ...(list.data?.slice(0, 20) ?? [])];
  function saved(value: StudyMaterial) { setPage(0); setSelected(value.id); list.refresh(); toast.success(`Đã lưu ${materialLabel[kind]}.`); }
  return <section className="space-y-5" aria-label={kind === "flashcards" ? "Flashcard từ tài liệu" : "Sơ đồ tư duy từ tài liệu"}>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold">{kind === "flashcards" ? <Layers3 className="size-5 text-primary" /> : <GitBranch className="size-5 text-primary" />}{kind === "flashcards" ? "Ôn tập với Flashcard" : "Kết nối kiến thức bằng sơ đồ"}</h2><p className="mt-1 text-sm text-muted-foreground">{kind === "flashcards" ? "Tự nhớ câu trả lời trước khi lật thẻ. Tiến độ được lưu cho từng bộ thẻ." : "Xem mối liên hệ giữa các chủ đề; chọn một nút để đọc ghi chú và nguồn."} Học liệu chỉ hiển thị với bạn.</p></div><StudyMaterialEditor documentId={documentId} kind={kind} ready={ready} onSaved={saved} /></header>
    {list.error ? <ErrorState message={list.error} retry={list.reload} /> : !list.data ? <LoadingState /> : <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {list.data.length > 0 && <div className="w-full space-y-2 sm:max-w-md"><Label htmlFor={`${id}-material`}>{kind === "flashcards" ? "Bộ thẻ đang học" : "Sơ đồ đang xem"}</Label><Select value={selectedId ?? null} onValueChange={setSelected} items={options.map(item => ({ value: item.id, label: item.title }))}><SelectTrigger id={`${id}-material`} className="min-h-11 w-full"><SelectValue placeholder="Chọn học liệu" /></SelectTrigger><SelectContent>{options.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></div>}
        <Pagination page={page} hasNext={list.data.length > 20} onPage={value => { setSelected(null); setPage(value); }} />
      </div>
      {selectedId ? <MaterialResource key={selectedId} materialId={selectedId} ready={ready} preview={preview} onRenamed={list.refresh} onDeleted={() => { setSelected(null); list.reload(); }} /> : <EmptyState title={`Chưa có ${materialLabel[kind]}`} description="Tạo thủ công hoặc để AI gợi ý từ tài liệu này. Nội dung đã lưu sẽ có ở đây khi bạn quay lại." />}
    </>}
  </section>;
}

function MaterialResource({ materialId, ...props }: { materialId: string; ready: boolean; preview: string; onRenamed: () => void; onDeleted: () => void }) {
  const resource = useResource<StudyMaterial>(`/study-materials/${materialId}`);
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <LoadingState />;
  return <MaterialWorkspace key={resource.data.id} initial={resource.data} {...props} />;
}

function MaterialWorkspace({ initial, ready, preview, onRenamed, onDeleted }: { initial: StudyMaterial; ready: boolean; preview: string; onRenamed: () => void; onDeleted: () => void }) {
  const [material, setMaterial] = useState(initial);
  const [version, setVersion] = useState(0);
  return <div className="rounded-xl border border-primary/20 bg-card shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 p-4"><div className="min-w-0"><h3 className="break-words font-semibold">{material.title}</h3><p className="mt-1 text-xs text-muted-foreground">{material.generation_model ? "Có nội dung do AI tạo · Hãy đối chiếu nguồn" : "Học liệu tự biên soạn"}</p></div><div className="flex flex-wrap gap-2"><StudyMaterialEditor documentId={material.document_id} kind={material.kind} ready={ready} material={material} onSaved={value => { setMaterial(value); setVersion(current => current + 1); onRenamed(); toast.success("Đã lưu thay đổi."); }} /><ConfirmAction title={`Xóa ${materialLabel[material.kind]}?`} description="Nội dung và tiến độ của học liệu này sẽ bị xóa. Tài liệu gốc được giữ nguyên." action={() => api(`/study-materials/${material.id}`, { method: "DELETE" })} onDone={() => { onDeleted(); toast.success("Đã xóa học liệu."); }} /></div></div>
    <div className="p-4 sm:p-5">{material.kind === "flashcards" ? <FlashcardStudy key={version} material={material} preview={preview} onChanged={setMaterial} /> : <MindMap key={version} material={material} preview={preview} />}</div>
  </div>;
}

function Sources({ material, ids, preview, excerpt }: { material: StudyMaterial; ids: string[]; preview: string; excerpt?: PDFSelection | null }) {
  const sources = material.sources.filter(source => ids.includes(source.chunk_id));
  return <section className="space-y-2 border-t pt-4" aria-label="Nguồn kiểm chứng">
    <h4 className="text-sm font-semibold">Nguồn kiểm chứng</h4>
    {excerpt && <details className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer text-primary">Đoạn đã chọn · Trang {excerpt.page_number}</summary><p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{excerpt.text}</p><a href={preview ? `${preview}#page=${excerpt.page_number}` : `/documents/${material.document_id}?page=${excerpt.page_number}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:underline">Mở trang nguồn<ExternalLink className="size-3.5" /></a></details>}
    {!ids.length ? !excerpt && <p className="text-xs text-muted-foreground">Nội dung tự biên soạn, chưa gắn nguồn trích dẫn.</p> : <>
      {sources.length < new Set(ids).size && <p className="text-xs text-amber-900">Một số đoạn nguồn không còn tồn tại. Hãy đối chiếu lại tài liệu.</p>}
      {sources.map(source => <details key={source.chunk_id} className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer text-primary">{source.title} · Trang {source.page_number}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{source.content}</p><a href={preview ? `${preview}#page=${source.page_number}` : `/documents/${material.document_id}?page=${source.page_number}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:underline">Mở trang nguồn<ExternalLink className="size-3.5" /></a></details>)}
    </>}
  </section>;
}

function FlashcardStudy({ material, preview, onChanged }: { material: StudyMaterial; preview: string; onChanged: (value: StudyMaterial) => void }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [filter, setFilter] = useState("due");
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const allCards = material.content.cards.map((card, position) => ({ ...card, position,
    due: !card.next_review_at || new Date(card.next_review_at).getTime() <= now }));
  const dueCount = allCards.filter(card => card.due).length;
  const cards = allCards.filter(card => filter === "due" ? card.due : filter === "unknown" ? !card.known : true);
  const current = cards[Math.min(index, cards.length - 1)];
  const known = material.content.cards.filter(card => card.known).length;
  const nextReview = allCards.map(card => card.next_review_at).filter((value): value is string => Boolean(value)).sort()[0];
  const reviewDate = (value: string) => new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
  function move(next: number) { setIndex(next); setFlipped(false); }
  async function review(value: boolean) {
    if (!current || !current.due || !flipped || pending) return;
    setPending(true); setError("");
    try {
      onChanged(await api<StudyMaterial>(`/study-materials/${material.id}/cards/${current.position}`, { method: "PATCH", body: JSON.stringify({ known: value }) }));
      setNow(Date.now());
      setFlipped(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1 text-sm text-muted-foreground"><p role="status"><span className="font-semibold text-primary">{dueCount}</span> thẻ đến hạn ôn</p><p>{known}/{material.content.cards.length} thẻ đã nhớ theo xác nhận của bạn</p></div><div className="w-full space-y-2 sm:w-56"><Label htmlFor={`${id}-filter`}>Thẻ muốn học</Label><Select value={filter} disabled={pending} onValueChange={value => { if (value) { setFilter(value); move(0); setNow(Date.now()); } }} items={[{ value: "due", label: "Đến hạn ôn" }, { value: "all", label: "Tất cả thẻ" }, { value: "unknown", label: "Chưa nhớ" }]}><SelectTrigger id={`${id}-filter`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due">Đến hạn ôn</SelectItem><SelectItem value="all">Tất cả thẻ</SelectItem><SelectItem value="unknown">Chưa nhớ</SelectItem></SelectContent></Select></div></div>
    <p className="text-xs leading-relaxed text-muted-foreground">Nhớ liên tiếp: ôn sau 1 → 2 → 4 → 8 → 16 → 30 ngày, sau đó giữ 30 ngày. Chưa nhớ: bắt đầu lại và ôn sau 10 phút. Lịch hiển thị theo giờ Việt Nam.</p>
    {current ? <>
      <Button variant="ghost" disabled={pending} aria-label={flipped ? "Đang hiện câu trả lời. Nhấn để xem câu hỏi" : "Đang hiện câu hỏi. Nhấn để xem câu trả lời"} aria-pressed={flipped} className="flex h-auto min-h-56 w-full flex-col gap-4 rounded-xl border border-primary/20 bg-accent/30 px-5 py-7 text-center whitespace-normal hover:bg-accent/60" onClick={() => setFlipped(value => !value)}>
        <span className="text-xs font-medium text-muted-foreground">Thẻ {Math.min(index + 1, cards.length)}/{cards.length} · {flipped ? "Trả lời" : "Câu hỏi"}{current.known && " · Đã nhớ"}</span>
        <span className="w-full whitespace-pre-wrap break-words text-lg leading-relaxed font-semibold text-foreground">{flipped ? current.back : current.front}</span>
        <span className="inline-flex items-center gap-2 text-xs text-primary"><RotateCw className="size-3.5" />Nhấn để lật thẻ</span>
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1"><Button variant="outline" className="size-11" aria-label="Thẻ trước" disabled={pending || Math.min(index, cards.length - 1) <= 0} onClick={() => move(Math.min(index, cards.length - 1) - 1)}><ChevronLeft /></Button><Button variant="outline" className="size-11" aria-label="Thẻ tiếp theo" disabled={pending || index >= cards.length - 1} onClick={() => move(index + 1)}><ChevronRight /></Button></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={pending || !flipped || !current.due} onClick={() => void review(false)}>Chưa nhớ</Button><Button className="min-h-11" disabled={pending || !flipped || !current.due} onClick={() => void review(true)}><Check />{pending ? "Đang lưu…" : "Tôi đã nhớ"}</Button></div></div>
      <p className="text-sm text-muted-foreground">{current.due ? "Lật thẻ rồi tự đánh giá để lưu lịch ôn tiếp theo." : `Ôn tiếp: ${reviewDate(current.next_review_at!)}. Bạn có thể tự luyện trước hạn; lịch ôn được giữ nguyên.`}</p>
      <Sources material={material} ids={current.source_ids} preview={preview} excerpt={current.excerpt} />
    </> : <div role="status" className="space-y-2 rounded-lg bg-accent/40 p-5 text-sm"><p>{filter === "due" ? "Bạn đã ôn xong các thẻ đến hạn." : "Không còn thẻ chưa nhớ."}</p>{filter === "due" && nextReview && <p>Lần ôn tiếp theo: {reviewDate(nextReview)}.</p>}<p>Chọn “Tất cả thẻ” để tự luyện thêm.</p></div>}
    <Feedback error={error} />
  </div>;
}

function MindMap({ material, preview }: { material: StudyMaterial; preview: string }) {
  const nodes = material.content.nodes;
  const root = nodes.find(node => node.parent_id === null)!;
  const [selected, setSelected] = useState(root.id);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const current = nodes.find(node => node.id === selected) ?? root;
  function branch(node: MindNode) {
    const children = nodes.filter(item => item.parent_id === node.id);
    return <li key={node.id} className="min-w-0 space-y-2">
      <div className="flex items-center gap-1"><Button variant={selected === node.id ? "default" : "outline"} aria-pressed={selected === node.id} className="h-auto min-h-11 min-w-0 justify-start px-3 py-2 text-left whitespace-normal" onClick={() => setSelected(node.id)}>{node.label}</Button>{children.length > 0 && <Button variant="ghost" className="size-11 shrink-0" aria-label={`${collapsed.includes(node.id) ? "Mở" : "Thu gọn"} nhánh ${node.label}`} aria-expanded={!collapsed.includes(node.id)} onClick={() => setCollapsed(values => values.includes(node.id) ? values.filter(value => value !== node.id) : [...values, node.id])}>{collapsed.includes(node.id) ? <ChevronRight /> : <ChevronLeft className="-rotate-90" />}</Button>}</div>
      {children.length > 0 && !collapsed.includes(node.id) && <ul className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">{children.map(branch)}</ul>}
    </li>;
  }
  return <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-3"><p className="text-xs text-muted-foreground">{nodes.length} nút · Chọn chủ đề để xem chi tiết, dùng mũi tên để thu gọn nhánh.</p><div className="overflow-x-auto rounded-xl bg-muted/30"><ul aria-label="Cấu trúc sơ đồ tư duy" className="w-max min-w-full p-3 sm:p-4 [&_button]:max-w-64">{branch(root)}</ul></div></div><section className="min-w-0 space-y-4 rounded-xl border p-4" aria-label="Chi tiết chủ đề"><h4 className="break-words text-lg font-semibold">{current.label}</h4><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{current.note || "Chưa có ghi chú cho chủ đề này."}</p><Sources material={material} ids={current.source_ids} preview={preview} excerpt={current.excerpt} /></section></div>;
}
