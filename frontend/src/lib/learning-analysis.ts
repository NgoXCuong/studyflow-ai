export type TopicAnalysis = {
  topic_key: string; topic: string; status: "insufficient_data" | "needs_review" | "on_track";
  available_question_count: number; question_count: number; correct_count: number; wrong_count: number;
  accuracy: number | null; initial_accuracy: number | null;
  practice_answer_count: number; practice_correct_count: number;
  last_assessed_at: string | null; last_practiced_at: string | null; reason: string;
  document_id: string | null; document_title: string | null; page_number: number | null;
  quiz_id: string | null; quiz_title: string | null; review_attempt_id: string | null;
};
export type CourseAnalysis = {
  course_id: string; course_title: string; minimum_questions: number; review_threshold: number;
  evaluation: "latest_full_per_unique_question"; topics: TopicAnalysis[];
};
export type TopicHistory = {
  attempt_id: string; quiz_id: string; quiz_title: string; scope: "full" | "wrong_only";
  purpose: "practice" | "diagnostic"; submitted_at: string;
  question_count: number; correct_count: number; accuracy: number;
};
export const topicStatusLabel = {
  insufficient_data: "Chưa đủ dữ liệu", needs_review: "Cần ôn", on_track: "Tạm ổn",
};
