"use client";

import { useId, useState } from "react";
import { ClipboardList, LoaderCircle, Plus, Save } from "lucide-react";
import { ErrorState, Feedback, LoadingState, Pagination } from "@/components/feedback";
import { ConfirmAction } from "@/components/study-forms";
import { QuizQuestionEditor } from "@/components/quiz-question-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResource } from "@/hooks/use-resource";
import { api, errorMessage, formatDate } from "@/lib/api";
import { difficultyLabels, type Quiz, type QuizDetail } from "@/lib/quizzes";

export function DocumentQuizzes({ documentId, title, ready, preview }: {
  documentId: string; title: string; ready: boolean; preview: string;
}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("");
  const { data, error, reload, refresh } = useResource<Quiz[]>(`/documents/${documentId}/quizzes?limit=13&offset=${page * 12}`);
  return <Card className="min-w-0"><CardContent className="space-y-5 pt-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 space-y-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="size-5 text-primary" />Quiz nháp từ tài liệu</h2><p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Tạo câu hỏi bằng AI, kiểm tra đáp án và chỉnh sửa trước khi sử dụng. Đây là không gian biên soạn riêng, chưa hỗ trợ làm bài hoặc giao cho lớp.</p></div><CreateQuiz documentId={documentId} title={title} ready={ready} onCreated={quiz => { setSelected(quiz.id); setPage(0); setNotice("Đã tạo quiz nháp. Hãy kiểm tra từng câu hỏi và nguồn."); refresh(); }} /></div>
    {!ready && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Chỉ có thể tạo quiz khi tài liệu ở trạng thái Sẵn sàng.</p>}
    <Feedback message={notice} />
    {error ? <ErrorState message={error} retry={reload} /> : !data ? <LoadingState /> : <div className="grid min-w-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside aria-label="Quiz nháp của bạn" className="min-w-0 space-y-3"><h3 className="text-sm font-semibold">Bản nháp của bạn</h3>{!data.length && <p className="text-sm leading-relaxed text-muted-foreground">Chưa có quiz. Chọn Tạo quiz để bắt đầu từ tài liệu này.</p>}{data.slice(0, 12).map(quiz => <Button key={quiz.id} variant={selected === quiz.id ? "secondary" : "outline"} className="h-auto min-h-16 w-full flex-col items-start gap-2 whitespace-normal p-3 text-left" onClick={() => { setSelected(quiz.id); setNotice(""); }} aria-pressed={selected === quiz.id}><span className="w-full break-words font-semibold">{quiz.title}</span><span className="text-sm font-normal text-muted-foreground">{difficultyLabels[quiz.difficulty]} · {formatDate(quiz.created_at)}</span></Button>)}<Pagination page={page} hasNext={data.length > 12} onPage={setPage} /></aside>
      <div className="min-w-0 border-t pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5">{selected ? <QuizEditor key={selected} quizId={selected} preview={preview} onChanged={refresh} onDeleted={() => { setSelected(undefined); setNotice("Đã xóa quiz nháp."); refresh(); }} /> : <div className="rounded-xl border border-dashed p-6 text-sm leading-relaxed text-muted-foreground">Chọn một quiz để xem câu hỏi, đáp án và nguồn tham khảo.</div>}</div>
    </div>}
  </CardContent></Card>;
}

function CreateQuiz({ documentId, title, ready, onCreated }: {
  documentId: string; title: string; ready: boolean; onCreated: (quiz: QuizDetail) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  function changeOpen(value: boolean) { if (!pending) { setOpen(value); setError(""); if (value) setDifficulty("medium"); } }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !ready) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const result = await api<QuizDetail>(`/documents/${documentId}/quizzes`, { method: "POST", body: JSON.stringify({
        title: String(form.get("title")).trim(), question_count: Number(form.get("count")),
        difficulty, topic: String(form.get("topic")).trim() || null,
      }) });
      setOpen(false); onCreated(result);
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogTrigger render={<Button disabled={!ready} className="min-h-11" />}><Plus />Tạo quiz</DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}><DialogHeader><DialogTitle>Tạo quiz từ tài liệu</DialogTitle><DialogDescription>AI tạo bản nháp từ tài liệu đang mở. Bạn cần đối chiếu nguồn và kiểm tra nội dung trước khi sử dụng.</DialogDescription></DialogHeader>
      <form onSubmit={create} className="space-y-4"><fieldset disabled={pending} className="grid min-w-0 gap-4">
        <div className="field"><Label htmlFor={`${id}-title`}>Tên quiz</Label><Input id={`${id}-title`} name="title" defaultValue={`Ôn tập: ${title}`.slice(0, 200)} required maxLength={200} className="app-input" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="field"><Label htmlFor={`${id}-count`}>Số câu hỏi</Label><Input id={`${id}-count`} name="count" type="number" min={1} max={10} step={1} defaultValue={5} required className="app-input" /><p className="text-sm text-muted-foreground">Từ 1 đến 10 câu.</p></div><div className="field"><Label htmlFor={`${id}-difficulty`}>Độ khó</Label><Select value={difficulty} onValueChange={value => setDifficulty(value ?? "medium")} items={Object.entries(difficultyLabels).map(([value, label]) => ({ value, label }))}><SelectTrigger id={`${id}-difficulty`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(difficultyLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="field"><Label htmlFor={`${id}-topic`}>Chủ đề <span className="font-normal text-muted-foreground">(không bắt buộc)</span></Label><Input id={`${id}-topic`} name="topic" maxLength={200} placeholder="Nội dung bạn muốn tập trung ôn" className="app-input" /></div>
      </fieldset><Feedback error={error} />{pending && <p role="status" className="text-sm text-muted-foreground">Đang tạo và kiểm tra câu hỏi. Vui lòng chờ, không gửi lại yêu cầu.</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>Hủy</Button><Button type="submit" disabled={pending || !ready} className="min-h-11">{pending && <LoaderCircle className="animate-spin" />}{pending ? "Đang tạo quiz…" : "Tạo bản nháp"}</Button></div></form>
    </DialogContent>
  </Dialog>;
}

function QuizEditor({ quizId, preview, onChanged, onDeleted }: {
  quizId: string; preview: string; onChanged: () => void; onDeleted: () => void;
}) {
  const id = useId();
  const { data: quiz, error, reload } = useResource<QuizDetail>(`/quizzes/${quizId}`);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setSaveError(""); setNotice("");
    try { await api(`/quizzes/${quizId}`, { method: "PATCH", body: JSON.stringify({ title: String(form.get("title")).trim() }) }); setNotice("Đã đổi tên quiz."); reload(); onChanged(); }
    catch (err) { setSaveError(errorMessage(err)); }
    finally { setPending(false); }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!quiz) return <LoadingState />;
  return <section className="min-w-0 space-y-5" aria-label="Biên soạn quiz">
    <div className="flex flex-wrap gap-2"><Badge variant="outline">Bản nháp</Badge><Badge variant="secondary">AI hỗ trợ tạo</Badge><Badge variant="outline">{difficultyLabels[quiz.difficulty]}</Badge><Badge variant="outline">{quiz.questions.length} câu</Badge></div>
    <h3 className="break-words text-xl font-semibold">{quiz.title}</h3>
    <form onSubmit={rename} className="flex flex-wrap items-end gap-2"><div className="field min-w-0 flex-1 basis-48"><Label htmlFor={`${id}-title`}>Tên quiz</Label><Input key={quiz.title} id={`${id}-title`} name="title" defaultValue={quiz.title} required maxLength={200} disabled={pending} className="app-input" /></div><Button type="submit" variant="outline" disabled={pending} className="min-h-11"><Save />{pending ? "Đang lưu…" : "Lưu tên"}</Button></form>
    <div className="flex justify-end"><ConfirmAction title="Xóa quiz nháp?" description={`Toàn bộ câu hỏi trong “${quiz.title}” sẽ bị xóa. Thao tác này không thể hoàn tác.`} action={() => api(`/quizzes/${quizId}`, { method: "DELETE" })} onDone={onDeleted} /></div>
    <Feedback error={saveError} message={notice} />
    <p className="rounded-lg bg-accent p-3 text-sm leading-relaxed text-accent-foreground">Chế độ biên soạn hiển thị đáp án đúng. Nội dung do AI hỗ trợ tạo cần được kiểm tra lại; bản nháp chỉ thuộc về bạn.</p>
    {quiz.questions.map(question => <QuizQuestionEditor key={`${question.id}-${quiz.updated_at}`} quizId={quizId} question={question} preview={preview} onSaved={() => { setNotice("Đã lưu câu hỏi."); reload(); onChanged(); }} />)}
  </section>;
}
