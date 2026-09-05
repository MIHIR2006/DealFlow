export type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Something went wrong",
    );
  }

  return data as T;
}

const TOKEN_KEY = "df360.token";

export function saveToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function readToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}
