import { api } from "@/lib/api";

export type Course = {
  id: string;
  owner_id: string;
  kind: "personal" | "teaching";
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};
export type Chapter = {
  id: string;
  course_id: string;
  title: string;
  position: number;
};
export type Topic = {
  id: string;
  course_id: string;
  chapter_id: string | null;
  title: string;
  description: string | null;
};
export type Classroom = {
  id: string;
  course_id: string;
  title: string;
  join_enabled: boolean;
  created_at: string;
  updated_at: string;
};
export type Member = {
  student_id: string;
  full_name: string;
  joined_at: string;
  left_at: string | null;
};

export async function listAll<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const batch = await api<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`,
      { signal },
    );
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
