import { Suspense } from "react";
import { LoadingState } from "@/components/feedback";
import { AdminAIUsage } from "@/components/admin-operations";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<LoadingState />}><AdminAIUsage /></Suspense>;
}
