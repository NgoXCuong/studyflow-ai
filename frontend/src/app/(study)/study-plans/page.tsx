import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { StudyPlans } from "@/components/study-plans";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<LoadingState />}><StudyPlans /></Suspense>;
}
