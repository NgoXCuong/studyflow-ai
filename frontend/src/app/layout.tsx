import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StudyFlow AI — Không gian học tập của bạn", template: "%s | StudyFlow AI" },
  description: "Sắp xếp môn học, kết nối lớp học và xây dựng nền tảng cho việc học có định hướng.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
