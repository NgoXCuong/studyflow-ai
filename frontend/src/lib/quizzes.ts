export type Quiz = {
  id: string; document_id: string; title: string; difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published"; classroom_id: string | null; reviewed_by: string | null;
  published_at: string | null; copied_from_id: string | null;
  ai_generated: true; generation_model: string; created_at: string; updated_at: string;
};
export type QuizQuestion = {
  id: string; position: number; question: string; choices: string[]; correct_index: number;
  explanation: string; topic: string;
  sources: { chunk_id: string; document_id: string; title: string; page_number: number; content: string }[];
};
export type QuizDetail = Quiz & { questions: QuizQuestion[] };
export type QuizListItem = Quiz & {
  course_id: string; course_title: string; document_title: string; classroom_title: string | null;
  question_count: number; is_owner: boolean; active_attempt_id: string | null;
};
export const difficultyLabels = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
