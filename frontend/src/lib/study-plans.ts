export type TimeSlot = { start_at: string; end_at: string };
export type PlanInput = {
  goal: string; exam_date: string; availability: TimeSlot[];
  read_minutes: number; quiz_minutes: number; review_minutes: number;
};
export type PlanSummary = {
  id: string; course_id: string; course_title: string; goal: string;
  exam_date: string; created_at: string; updated_at: string;
};
export type StudyTask = {
  id: string; topic_key: string; topic: string; kind: "read" | "quiz" | "review";
  duration_minutes: number; reason: string; document_id: string | null;
  quiz_id: string | null; page_number: number | null; scheduled_at: string | null;
  completed_at: string | null; unscheduled_reason: string | null;
};
export type StudyPlan = PlanSummary & PlanInput & { timezone: "UTC+7"; tasks: StudyTask[] };
export const taskKindLabel = { read: "Đọc tài liệu", quiz: "Luyện quiz", review: "Kiểm tra lại" };
export function vietnamInputTime(value: string) {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function vietnamDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
export function examDateLabel(value: string) {
  return value.split("-").reverse().join("/");
}

export function studyWeek(value: string, offset = 0) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(date.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
