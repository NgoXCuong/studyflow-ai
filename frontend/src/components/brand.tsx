import Link from "next/link";
import { BookOpen } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`inline-flex items-center gap-2.5 font-semibold ${light ? "text-white" : "text-foreground"}`} aria-label="StudyFlow AI — Trang chủ">
    <span className={`flex size-10 items-center justify-center rounded-xl ${light ? "bg-white/15" : "bg-primary text-white"}`}><BookOpen className="size-5" /></span>
    <span className="text-xl">StudyFlow<span className={`ml-1 text-xs font-medium ${light ? "text-teal-200" : "text-primary"}`}>AI</span></span>
  </Link>;
}
