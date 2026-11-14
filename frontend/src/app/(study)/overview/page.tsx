import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { StudentOverview } from "@/components/student-overview";

// StudyShell waits for client-side authentication before rendering this page.
export const instant = false;

export default function Page() {
  return <Suspense fallback={<LoadingState />}><StudentOverview /></Suspense>;
}
