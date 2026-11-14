import type { Attempt } from "@/lib/attempts";
import type { CourseAnalysis } from "@/lib/learning-analysis";
import type { StudyTask } from "@/lib/study-plans";

export type OverviewTask = Pick<StudyTask, "id" | "topic" | "kind" | "duration_minutes"> & {
  plan_id: string; course_id: string; course_title: string; scheduled_at: string;
};
export type OverviewAttempt = Attempt & { course_id: string; course_title: string };
export type StudentOverview = {
  generated_at: string; date: string; timezone: "UTC+7";
  plan_progress: { plan_count: number; task_count: number; completed_task_count: number; unscheduled_task_count: number };
  today_count: number; overdue_count: number;
  today_tasks: OverviewTask[]; overdue_tasks: OverviewTask[];
  active_attempts: OverviewAttempt[]; recent_attempts: OverviewAttempt[];
  analysis: CourseAnalysis | null;
};
