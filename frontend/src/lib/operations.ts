export type ProcessingItem = {
  document_id: string; owner_id: string; status: string; source_removed: boolean; attempt_count: number;
  started_at: string | null; finished_at: string | null; lease_expires_at: string | null;
  error_code: string | null; created_at: string; updated_at: string;
};
export type ProcessingOverview = { total: number; counts: Record<string, number>; items: ProcessingItem[] };
export type UsageItem = {
  id: string; document_id: string; owner_id: string; provider: string; model: string;
  operation: string; status: string; input_characters: number; chunk_count: number;
  duration_ms: number; total_tokens: number | null; error_code: string | null; created_at: string;
};
export type UsageOverview = {
  total: number; success_count: number; failed_count: number; recorded_tokens: number | null;
  token_recorded_count: number; average_duration_ms: number | null;
  operations: Record<string, number>; items: UsageItem[];
};
export const operationLabel: Record<string, string> = {
  document_embedding: "Embedding tài liệu", question_embedding: "Embedding câu hỏi",
  qa_generation: "Sinh câu trả lời", quiz_generation: "Tạo quiz", flashcards_generation: "Tạo flashcard", mindmap_generation: "Tạo sơ đồ tư duy",
};
export const processingStatusLabel: Record<string, string> = { queued: "Chờ xử lý", processing: "Đang xử lý", ready: "Sẵn sàng", failed: "Thất bại" };
