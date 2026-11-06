export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "student" | "teacher" | "admin";
  status: "active" | "locked";
  email_verified_at: string | null;
  created_at: string;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const apiUrl = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1`;
let refreshRequest: Promise<Response> | null = null;

export async function api<T>(path: string, options: RequestInit = {}, refresh = true, responseType: "json" | "blob" = "json"): Promise<T> {
  const send = () => fetch(`${apiUrl}${path}`, {
    ...options, credentials: "include", cache: "no-store",
    headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  try {
    let response = await send();
    if (response.status === 401 && refresh) {
      refreshRequest ??= fetch(`${apiUrl}/auth/refresh`, {
        method: "POST", credentials: "include", cache: "no-store",
      }).finally(() => { refreshRequest = null; });
      const renewed = await refreshRequest;
      if (renewed.ok) response = await send();
      else if (renewed.status !== 401) response = renewed;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail = data?.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail)
        ? detail.map((error: { loc: (string | number)[]; msg: string }) => `${error.loc.slice(1).join(".")}: ${error.msg}`).join("; ")
        : "Yêu cầu chưa thực hiện được. Vui lòng thử lại.";
      throw new ApiError(message, response.status);
    }
    return (responseType === "blob" ? await response.blob() : await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw new ApiError("Không kết nối được máy chủ. Vui lòng thử lại sau.", 0);
  }
}

export const jsonBody = (data: object): RequestInit => ({ method: "POST", body: JSON.stringify(data) });
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Đã xảy ra lỗi. Vui lòng thử lại.";
export const roleLabel = { student: "Sinh viên", teacher: "Giảng viên", admin: "Quản trị viên" };
export const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
