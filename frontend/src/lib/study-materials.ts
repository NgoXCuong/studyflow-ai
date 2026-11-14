export type MaterialKind = "flashcards" | "mindmap";
export type PDFSelection = { page_number: number; text: string };
export type Flashcard = {
  front: string; back: string; source_ids: string[]; known: boolean; excerpt?: PDFSelection | null;
  review_streak?: number; last_reviewed_at?: string | null; next_review_at?: string | null;
};
export type MindNode = { id: string; parent_id: string | null; label: string; note: string; source_ids: string[]; excerpt?: PDFSelection | null };
export type MaterialContent = { cards: Flashcard[]; nodes: MindNode[] };
export type MaterialSummary = {
  id: string; document_id: string; kind: MaterialKind; title: string;
  generation_model: string | null; created_at: string; updated_at: string;
};
export type StudyMaterial = MaterialSummary & {
  content: MaterialContent;
  sources: { chunk_id: string; page_number: number; title: string; content: string }[];
};
export const materialLabel = { flashcards: "bộ thẻ", mindmap: "sơ đồ tư duy" };
