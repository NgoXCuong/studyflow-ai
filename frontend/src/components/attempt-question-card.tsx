"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, ExternalLink, Lightbulb, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AttemptQuestion } from "@/lib/attempts";
import { cn } from "@/lib/utils";

function formatSourceParagraphs(content: string) {
  return content
    .replace(/\s+(?=(?:Bước\s+\d+\b|\d{1,2}[.)]\s+\p{Lu}|[•●▪]\s))/gu, "\n")
    .split(/\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

export function AttemptQuestionCard({ question, index, submitted, selectedIndex, pending, onSelect }: {
  question: AttemptQuestion;
  index: number;
  submitted: boolean;
  selectedIndex: number | null;
  pending: boolean;
  onSelect: (questionId: string, value: number | null) => Promise<void>;
}) {
  const [expandedSources, setExpandedSources] = useState<string[]>([]);

  return <Card id={`attempt-question-${question.id}`} className="min-w-0 scroll-mt-28 overflow-hidden rounded-2xl border py-0 shadow-none ring-0"><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h2 id={`question-${question.id}`} className="shrink-0 text-sm font-semibold">Câu {String(index + 1).padStart(2, "0")}</h2>
          <Badge variant="outline" className="h-auto min-h-6 max-w-full min-w-0 shrink whitespace-normal break-words px-2.5 py-1 text-muted-foreground">{question.topic}</Badge>
        </div>
        {submitted && <Badge variant={question.selected_index === null ? "outline" : question.is_correct ? "secondary" : "destructive"} className={cn("h-7 gap-1.5 px-2.5", question.is_correct && "bg-emerald-50 text-emerald-700")}>
          {question.selected_index === null ? <Minus aria-hidden="true" /> : question.is_correct ? <CheckCircle2 aria-hidden="true" /> : <X aria-hidden="true" />}
          {question.selected_index === null ? "Bỏ trống" : question.is_correct ? "Trả lời đúng" : "Chưa chính xác"}
        </Badge>}
      </div>
      <p className="whitespace-pre-wrap break-words text-base font-medium leading-6">{question.question}</p>
      {submitted ? <ol className="space-y-2">{question.choices.map((choice, choiceIndex) => {
        const correct = choiceIndex === question.correct_index;
        const selected = choiceIndex === question.selected_index;
        return <li key={choiceIndex} className={cn("flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5", correct ? "border-emerald-200 bg-emerald-50/70" : selected ? "border-destructive/30 bg-destructive/5" : "border-border/80")}>
          <span aria-hidden="true" className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold", correct ? "border-emerald-200 bg-emerald-100 text-emerald-700" : selected ? "border-destructive/25 bg-destructive/10 text-destructive" : "border-border bg-muted/50 text-muted-foreground")}>{"ABCD"[choiceIndex]}</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 basis-40 whitespace-pre-wrap break-words text-sm leading-6">{choice}</p>
            {(correct || selected) && <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs font-medium">
              {correct && <span className="text-emerald-700">Đáp án đúng</span>}
              {selected && <span className={correct ? "text-emerald-700" : "text-destructive"}>{correct ? "· Đã chọn" : "Bạn đã chọn"}</span>}
            </div>}
          </div>
          {correct ? <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" aria-hidden="true" /> : selected ? <X className="mt-1 size-5 shrink-0 text-destructive" aria-hidden="true" /> : null}
        </li>;
      })}</ol> : <>
        <RadioGroup aria-labelledby={`question-${question.id}`} value={selectedIndex === null ? "" : String(selectedIndex)} onValueChange={value => { if (typeof value === "string" && value !== "") void onSelect(question.id, Number(value)); }} disabled={pending}>
          {question.choices.map((choice, choiceIndex) => <Label key={choiceIndex} htmlFor={`${question.id}-${choiceIndex}`} className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 leading-relaxed"><RadioGroupItem id={`${question.id}-${choiceIndex}`} value={String(choiceIndex)} className="mt-1" /><span className="min-w-0 whitespace-pre-wrap break-words">{"ABCD"[choiceIndex]}. {choice}</span></Label>)}
        </RadioGroup><Button variant="ghost" className="min-h-11" disabled={pending || selectedIndex === null} onClick={() => onSelect(question.id, null)}>Bỏ lựa chọn</Button>
      </>}
      {submitted && <div className="space-y-4 border-t pt-4">
        <section className="space-y-2 rounded-lg bg-muted/30 p-3.5" aria-label="Giải thích đáp án">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4 text-primary" aria-hidden="true" />Giải thích đáp án</h3>
          <div className="space-y-2 text-sm leading-6 [overflow-wrap:anywhere]">
            {question.explanation?.split(/\n+/).filter(line => line.trim()).map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="whitespace-pre-wrap">{paragraph}</p>)}
          </div>
        </section>
        {!!question.sources?.length && <section className="space-y-3" aria-label="Nguồn kiểm chứng">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />Nguồn kiểm chứng<span className="text-xs font-normal text-muted-foreground">({question.sources.length})</span></h3>
          {question.sources.map(source => {
            const expanded = expandedSources.includes(source.chunk_id);
            const contentId = `source-${question.id}-${source.chunk_id}`;
            const paragraphs = formatSourceParagraphs(source.content);
            return <div key={source.chunk_id} className="min-w-0 rounded-lg border border-border/80 px-3.5 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <Button variant="ghost" className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-0 text-left hover:bg-transparent" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpandedSources(current => expanded ? current.filter(id => id !== source.chunk_id) : [...current, source.chunk_id])}>
                  <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", expanded && "rotate-180")} /><span className="min-w-0 break-words">{source.title}</span><span className="sr-only">{expanded ? ": Thu gọn trích đoạn" : ": Xem trích đoạn"}</span>
                </Button>
                <Link href={`/documents/${source.document_id}?page=${source.page_number}`} aria-label={`Xem trang ${source.page_number} của ${source.title}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring">Xem trang {source.page_number}<ExternalLink className="size-3.5" aria-hidden="true" /></Link>
              </div>
              <blockquote id={contentId} hidden={!expanded} className="mb-2 mt-2 space-y-2 border-l-2 border-primary/25 pl-3 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {paragraphs.map((paragraph, paragraphIndex) => {
                  const marker = paragraph.match(/^(Bước\s+\d+[:.)]?|\d{1,2}[.)]|[•●▪])\s*/u)?.[0];
                  return <p key={paragraphIndex} className="whitespace-pre-wrap">{marker && <strong className="font-semibold text-foreground">{marker}</strong>}{marker ? paragraph.slice(marker.length) : paragraph}</p>;
                })}
              </blockquote>
            </div>;
          })}
        </section>}
      </div>}
    </CardContent></Card>;
}
