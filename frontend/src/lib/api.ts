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
  constructor(message: string, public status: number) {
    super(message);
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
let refreshRequest: Promise<Response> | null = null;

export async function api<T>(path: string, options: RequestInit = {}, refresh = true): Promise<T> {
  const send = () => fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
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
    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail;
      const message = typeof detail === "string" ? detail : Array.isArray(detail)
        ? detail.map((error: { loc: string[]; msg: string }) => `${error.loc.slice(1).join(".")}: ${error.msg}`).join("; ")
        : "Yêu cầu chưa thực hiện được. Vui lòng thử lại.";
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Không kết nối được API. Vui lòng kiểm tra backend và kết nối mạng.", 0);
  }
}
