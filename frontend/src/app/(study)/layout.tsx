import { Suspense } from "react";
import { StudyShell } from "@/components/study-shell";
import { LoadingState } from "@/components/feedback";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <LoadingState />
        </div>
      }
    >
      <StudyShell>{children}</StudyShell>
    </Suspense>
  );
}
