import { Suspense } from "react";
import { ClassroomDetail } from "@/components/classroom-detail";
import { LoadingState } from "@/components/feedback";
export const instant = false;
export default function Page() { return <Suspense fallback={<LoadingState />}><ClassroomDetail /></Suspense>; }
