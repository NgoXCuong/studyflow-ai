import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { LearningResults } from "@/components/learning-results";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<LoadingState />}><LearningResults /></Suspense>;
}
