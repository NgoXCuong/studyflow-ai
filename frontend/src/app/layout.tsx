import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "StudyFlow AI — Không gian học tập của bạn",
    template: "%s | StudyFlow AI",
  },
  description:
    "Sắp xếp môn học, kết nối lớp học và xây dựng nền tảng cho việc học có định hướng.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body><Toaster />{children}</body>
    </html>
  );
}
