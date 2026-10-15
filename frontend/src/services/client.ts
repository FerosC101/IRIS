/**
 * Fetch wrapper for the IRIS API.
 *
 * The demo user chosen in the role selector is sent as ``X-IRIS-User``. This is
 * a prototype convenience, not authentication.
 */

const USER_KEY = "iris.demoUser";

export function getDemoUser(): string | null {
  try {
    return window.localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setDemoUser(id: string) {
  try {
    window.localStorage.setItem(USER_KEY, id);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  currentUser = id;
}

let currentUser: string | null = typeof window !== "undefined" ? getDemoUser() : null;

export function activeUser(): string | null {
  return currentUser;
}

export class ApiError extends Error {
  status: number;
  issues: { row: number | null; column: string | null; message: string; value?: string | null }[];
  constructor(status: number, message: string, issues: ApiError["issues"] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

function messageFrom(status: number, body: unknown): { message: string; issues: ApiError["issues"] } {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return { message: detail, issues: [] };
    if (Array.isArray(detail)) {
      // FastAPI validation errors
      const parts = detail.map((d: { loc?: (string | number)[]; msg?: string }) => `${(d.loc ?? []).filter((x) => x !== "body").join(".")}: ${d.msg}`);
      return { message: `Some fields are invalid — ${parts.join("; ")}`, issues: [] };
    }
    if (detail && typeof detail === "object" && "message" in detail) {
      const d = detail as { message: string; errors?: ApiError["issues"] };
      return { message: d.message, issues: d.errors ?? [] };
    }
  }
  if (status === 0) return { message: "The IRIS server could not be reached. Check that the backend is running, then try again.", issues: [] };
  if (status >= 500) return { message: "The server had a problem completing this request. Try again; if it continues, reset the demo data.", issues: [] };
  return { message: `Request failed (${status}).`, issues: [] };
}

export async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (currentUser) headers.set("X-IRIS-User", currentUser);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body });
  } catch {
    const m = messageFrom(0, null);
    throw new ApiError(0, m.message);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const m = messageFrom(res.status, data);
    throw new ApiError(res.status, m.message, m.issues);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
