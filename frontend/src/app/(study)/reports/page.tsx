import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { ClassroomReports } from "@/components/classroom-reports";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<LoadingState />}><ClassroomReports /></Suspense>;
}
