import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { QuizAttempt } from "@/components/quiz-attempt";

export const instant = false;
export default function Page() {
  return <Suspense fallback={<LoadingState />}><QuizAttempt /></Suspense>;
}
