"use client";

import { useId, useState } from "react";
import { LoaderCircle, Plus, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage } from "@/lib/api";

type Conversation = { id: string; title: string; document_id: string };
type Turn = {
  id: string; question: string;
  answer: { answer: string; insufficient_evidence: boolean;
    sources: { chunk_id: string; title: string; page_number: number; content: string }[] };
};

export function DocumentQA({ documentId, preview }: { documentId: string; preview: string }) {
  const [selected, setSelected] = useState<Conversation>();
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { data, error: listError, reload, refresh } = useResource<Conversation[]>(`/documents/${documentId}/conversations?limit=21&offset=${page * 20}`);
  async function create() {
    setPending(true); setError("");
    try {
      const result = await api<Conversation>(`/documents/${documentId}/conversations`, { method: "POST", body: JSON.stringify({ title: "Hội thoại mới" }) });
      setSelected(result); setPage(0); refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <Card className="min-w-0"><CardContent className="space-y-4 pt-6">
    <div><h2 className="text-lg font-semibold">Hỏi đáp theo tài liệu</h2><p className="mt-1 text-sm text-muted-foreground">Hội thoại được lưu riêng cho bạn. Hỏi tiếp trong cùng hội thoại để giữ ngữ cảnh.</p></div>
    <Feedback error={error} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3" aria-label="Danh sách hội thoại">
        <Button onClick={create} disabled={pending} className="min-h-11 w-full">{pending ? <LoaderCircle className="animate-spin" /> : <Plus />}Hội thoại mới</Button>
        {listError ? <ErrorState message={listError} retry={reload} /> : !data ? <LoadingState /> : <>
          {!data.length && <p className="text-sm text-muted-foreground">Chưa có hội thoại. Tạo hội thoại để bắt đầu.</p>}
          {data.slice(0, 20).map(item => <Button key={item.id} variant={selected?.id === item.id ? "secondary" : "ghost"} className="h-auto min-h-11 w-full justify-start whitespace-normal break-words text-left" onClick={() => setSelected(item)} aria-pressed={selected?.id === item.id}>{item.title}</Button>)}
          <Pagination page={page} hasNext={data.length > 20} onPage={setPage} />
        </>}
      </aside>
      <section className="min-w-0 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5" aria-label="Nội dung hội thoại">
        {selected ? <ConversationChat key={selected.id} conversation={selected} preview={preview} onRenamed={value => { setSelected(value); refresh(); }} onDeleted={() => { setSelected(undefined); refresh(); }} onSent={refresh} /> : <p className="py-8 text-sm text-muted-foreground">Chọn hội thoại hoặc tạo hội thoại mới để đặt câu hỏi về tài liệu.</p>}
      </section>
    </div>
  </CardContent></Card>;
}

function ConversationChat({ conversation, preview, onRenamed, onDeleted, onSent }: {
  conversation: Conversation; preview: string; onRenamed: (value: Conversation) => void; onDeleted: () => void; onSent: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(conversation.title);
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { data: turns, error: readError, reload, refresh } = useResource<Turn[]>(`/conversations/${conversation.id}/turns?limit=51&offset=${page * 50}`);
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try { onRenamed(await api<Conversation>(`/conversations/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ title: title.trim() }) })); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !question.trim()) return;
    setPending(true); setError("");
    try {
      await api<Turn>(`/conversations/${conversation.id}/turns`, { method: "POST", body: JSON.stringify({ question: question.trim() }) });
      setQuestion(""); setPage(0); refresh(); onSent();
    } catch (err) { setError(errorMessage(err)); if (readError) reload(); }
    finally { setPending(false); }
  }
  return <div className="space-y-4">
    <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor={`${id}-title`}>Tên hội thoại</Label><Input id={`${id}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required disabled={pending} /></div>
      <Button type="submit" variant="outline" disabled={pending || !title.trim()}>Đổi tên</Button>
      <fieldset disabled={pending}><ConfirmAction title="Xóa hội thoại?" description="Toàn bộ câu hỏi, câu trả lời và nguồn đã lưu trong hội thoại này sẽ bị xóa." action={() => api(`/conversations/${conversation.id}`, { method: "DELETE" })} onDone={onDeleted} /></fieldset>
    </form>
    <Feedback error={error} />
    {readError ? <ErrorState message={readError} retry={reload} /> : !turns ? <LoadingState /> : <>
      {!turns.length && <p className="text-sm text-muted-foreground">Chưa có tin nhắn. Bạn có thể hỏi, yêu cầu giải thích hoặc tóm tắt tài liệu.</p>}
      <div className="space-y-5" aria-live="polite">{turns.slice(0, 50).reverse().map(turn => <article key={turn.id} className="space-y-3 border-b pb-4">
        <p className="whitespace-pre-wrap break-words rounded-lg bg-accent p-3 font-medium">{turn.question}</p>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{turn.answer.answer}</p>
        {turn.answer.sources.map(source => <div key={source.chunk_id} className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <p className="break-words text-sm font-medium">{source.title} · Trang {source.page_number}</p>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{source.content}</p>
          {preview && <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`${preview}#page=${source.page_number}`} target="_blank" rel="noopener noreferrer">Mở trang {source.page_number}</a>}
        </div>)}
      </article>)}</div>
      <Pagination page={page} hasNext={turns.length > 50} onPage={setPage} />
      <p className="text-xs text-muted-foreground">Câu trả lời do AI tạo. Hãy đối chiếu nguồn trong tài liệu.</p>
    </>}
    <form onSubmit={submit} className="space-y-3">
      <Label htmlFor={`${id}-question`}>Câu hỏi của bạn</Label>
      <Textarea id={`${id}-question`} value={question} onChange={event => setQuestion(event.target.value)} required maxLength={2000} disabled={pending || !!readError} className="min-h-24" placeholder="Hỏi tiếp hoặc yêu cầu giải thích chi tiết…" />
      <Button type="submit" disabled={pending || !!readError || !question.trim()} className="min-h-11">{pending ? <LoaderCircle className="animate-spin" /> : <Send />}{pending ? "Đang xử lý…" : "Gửi câu hỏi"}</Button>
    </form>
  </div>;
}
