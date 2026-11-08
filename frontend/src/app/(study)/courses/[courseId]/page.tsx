import { Suspense } from "react";
import { CourseDetail } from "@/components/course-detail";
import { LoadingState } from "@/components/feedback";
export const instant = false;
export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CourseDetail />
    </Suspense>
  );
}
