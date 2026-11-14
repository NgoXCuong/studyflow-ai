import type { QuizQuestion } from "@/lib/quizzes";

export type Attempt = {
  id: string; quiz_id: string; title: string; document_id: string;
  scope: "full" | "wrong_only"; purpose: "practice" | "diagnostic";
  source_attempt_id: string | null; status: "in_progress" | "submitted";
  started_at: string; submitted_at: string | null; question_count: number;
  answered_count: number; correct_count: number | null; score: number | null;
};
export type AttemptQuestion = {
  id: string; position: number; question: string; choices: string[]; topic: string;
  difficulty: string; selected_index: number | null;
  correct_index?: number; is_correct?: boolean; explanation?: string; sources?: QuizQuestion["sources"];
};
export type AttemptDetail = Attempt & { questions: AttemptQuestion[] };
export type StudentAttempt = Attempt & { student_id: string; student_name: string };
export type QuizStatistics = {
  quiz_id: string; submitted_count: number; student_count: number; average_score: number | null;
  questions: { question_id: string; question: string; topic: string; attempt_count: number;
    correct_count: number; wrong_count: number; skipped_count: number }[];
};
export const purposeLabel = { practice: "Luyện tập", diagnostic: "Kiểm tra đầu vào" };
export const scopeLabel = { full: "Toàn bộ câu hỏi", wrong_only: "Luyện câu sai" };
