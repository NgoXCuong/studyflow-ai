export type QuizReport = {
  quiz_id: string; title: string; document_id: string; published_at: string;
  question_count: number; submitted_count: number; student_count: number;
  current_submitted_count: number; current_not_submitted_count: number; average_score: number | null;
};
export type TopicReport = {
  topic_key: string; topic: string; answer_count: number; correct_count: number;
  wrong_count: number; skipped_count: number; accuracy: number | null;
};
export type ClassroomReport = {
  classroom_id: string; classroom_title: string; course_id: string; course_title: string;
  current_member_count: number; quiz_count: number; submitted_count: number;
  quizzes: QuizReport[]; topics: TopicReport[];
};
export type StudentReport = {
  student_id: string; full_name: string; joined_at: string; left_at: string | null;
  submitted_quiz_count: number; submitted_count: number; average_score: number | null; last_submitted_at: string | null;
};
