export type Quiz = {
  id: string; document_id: string; title: string; difficulty: "easy" | "medium" | "hard";
  status: "draft"; ai_generated: true; generation_model: string; created_at: string; updated_at: string;
};
export type QuizQuestion = {
  id: string; position: number; question: string; choices: string[]; correct_index: number;
  explanation: string; topic: string;
  sources: { chunk_id: string; document_id: string; title: string; page_number: number; content: string }[];
};
export type QuizDetail = Quiz & { questions: QuizQuestion[] };
export const difficultyLabels = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
