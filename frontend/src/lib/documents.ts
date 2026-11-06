export type StudyDocument = {
  id: string;
  course_id: string;
  owner_id: string;
  classroom_id: string | null;
  chapter_id: string | null;
  title: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: "queued" | "processing" | "ready" | "failed";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const documentStatus = {
  queued: "Chờ xử lý",
  processing: "Đang xử lý",
  ready: "Sẵn sàng",
  failed: "Xử lý thất bại",
};

export type DocumentProcessing = {
  document_id: string;
  status: StudyDocument["status"];
  attempt_count: number;
  chunk_count: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export const formatFileSize = (size: number) => size >= 1024 * 1024
  ? `${(size / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MiB`
  : `${Math.max(1, Math.round(size / 1024))} KiB`;

export const documentMaxSize = 20 * 1024 * 1024;
