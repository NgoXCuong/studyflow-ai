"use client";

import { useId, useState } from "react";
import { Check, Pencil, Save } from "lucide-react";
import { Feedback } from "@/components/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import type { QuizQuestion } from "@/lib/quizzes";

export function QuizQuestionEditor({ quizId, question, preview, onSaved }: {
  quizId: string; question: QuizQuestion; preview: string; onSaved: () => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [correct, setCorrect] = useState(String(question.correct_index));
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const choices = [0, 1, 2, 3].map(index => String(form.get(`choice-${index}`)).trim());
    if (new Set(choices.map(choice => choice.toLocaleLowerCase())).size !== 4) { setError("Bốn lựa chọn phải khác nhau."); return; }
    setPending(true); setError("");
    try {
      await api(`/quizzes/${quizId}/questions/${question.id}`, { method: "PUT", body: JSON.stringify({
        question: String(form.get("question")).trim(), choices, correct_index: Number(correct),
        explanation: String(form.get("explanation")).trim(), topic: String(form.get("topic")).trim(),
        source_ids: question.sources.map(source => source.chunk_id),
      }) });
      setEditing(false); onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <article className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">Câu {question.position + 1}</h4>{!editing && <Button variant="outline" className="min-h-11" onClick={() => { setCorrect(String(question.correct_index)); setError(""); setEditing(true); }}><Pencil />Sửa câu hỏi</Button>}</div>
    {editing ? <form onSubmit={save} className="space-y-4">
      <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <div className="field"><Label htmlFor={`${id}-question`}>Nội dung câu hỏi</Label><Textarea id={`${id}-question`} name="question" defaultValue={question.question} required maxLength={2000} className="min-h-24" /></div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">{question.choices.map((choice, index) => <div key={index} className="field min-w-0"><Label htmlFor={`${id}-choice-${index}`}>Lựa chọn {"ABCD"[index]}</Label><Textarea id={`${id}-choice-${index}`} name={`choice-${index}`} defaultValue={choice} required maxLength={500} /></div>)}</div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2"><div className="field"><Label htmlFor={`${id}-correct`}>Đáp án đúng</Label><Select value={correct} onValueChange={value => setCorrect(value ?? "0")} items={[0, 1, 2, 3].map(index => ({ value: String(index), label: `Lựa chọn ${"ABCD"[index]}` }))}><SelectTrigger id={`${id}-correct`} className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map(index => <SelectItem key={index} value={String(index)}>Lựa chọn {"ABCD"[index]}</SelectItem>)}</SelectContent></Select></div><div className="field"><Label htmlFor={`${id}-topic`}>Chủ đề chính</Label><Input id={`${id}-topic`} name="topic" defaultValue={question.topic} required maxLength={200} className="app-input" /></div></div>
        <div className="field"><Label htmlFor={`${id}-explanation`}>Giải thích đáp án</Label><Textarea id={`${id}-explanation`} name="explanation" defaultValue={question.explanation} required maxLength={2000} className="min-h-24" /></div>
        <p className="text-sm text-muted-foreground">Nguồn trích dẫn được giữ nguyên. Đối chiếu nội dung bên dưới trước khi lưu.</p>
      </fieldset>
      <Feedback error={error} /><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setEditing(false)}>Hủy</Button><Button type="submit" disabled={pending} className="min-h-11"><Save />{pending ? "Đang lưu…" : "Lưu câu hỏi"}</Button></div>
    </form> : <>
      <p className="whitespace-pre-wrap break-words font-medium leading-relaxed">{question.question}</p>
      <ol className="grid gap-2 sm:grid-cols-2">{question.choices.map((choice, index) => <li key={index} className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 ${index === question.correct_index ? "border-primary/30 bg-accent" : "bg-background"}`}><span className="font-semibold">{"ABCD"[index]}.</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{choice}</span>{index === question.correct_index && <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary"><Check className="size-4" />Đúng</span>}</li>)}</ol>
      <p className="text-sm text-muted-foreground">Chủ đề: <span className="font-medium text-foreground">{question.topic}</span></p>
      <div className="space-y-2"><h5 className="text-sm font-semibold">Giải thích</h5><p className="whitespace-pre-wrap break-words leading-relaxed">{question.explanation}</p></div>
    </>}
    <div className="space-y-3 border-t pt-4"><h5 className="text-sm font-semibold">Nguồn để kiểm chứng</h5>{question.sources.map(source => <div key={source.chunk_id} className="space-y-2 rounded-lg bg-muted/50 p-3"><p className="break-words text-sm font-medium">{source.title} · Trang {source.page_number}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{source.content}</p>{preview && <a href={`${preview}#page=${source.page_number}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>Mở trang {source.page_number}</a>}</div>)}</div>
  </article>;
}
