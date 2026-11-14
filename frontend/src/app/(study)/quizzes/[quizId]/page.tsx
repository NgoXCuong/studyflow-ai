import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { QuizPractice } from "@/components/quiz-practice";

export const instant = false;
export default function Page() {
  return <Suspense fallback={<LoadingState />}><QuizPractice /></Suspense>;
}
