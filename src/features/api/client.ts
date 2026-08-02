export type ApiErrorShape = { error: { code: string; message: string; requestId: string } };

function cookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = cookie("omm_csrf");
    if (csrf) headers.set("X-CSRF-Token", decodeURIComponent(csrf));
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | { data: T; meta: { requestId: string } }
    | ApiErrorShape
    | null;
  if (!response.ok || !payload || !("data" in payload)) {
    const failure = payload && "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      failure?.code ?? "REQUEST_FAILED",
      failure?.message ?? "请求失败。",
      failure?.requestId ?? response.headers.get("x-request-id") ?? undefined,
      response.status,
    );
  }
  return payload.data;
}
