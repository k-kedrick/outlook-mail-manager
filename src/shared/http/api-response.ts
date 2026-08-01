import { NextResponse } from "next/server";

const SECURE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export function apiSuccess<T>(data: T, init?: ResponseInit & { requestId?: string }): NextResponse {
  const requestId = init?.requestId ?? crypto.randomUUID();
  return NextResponse.json(
    { data, meta: { requestId } },
    {
      ...init,
      headers: {
        ...SECURE_HEADERS,
        "X-Request-Id": requestId,
        ...(init?.headers ?? {}),
      },
    },
  );
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
  options: { requestId?: string; details?: Record<string, unknown>; headers?: HeadersInit } = {},
): NextResponse {
  const requestId = options.requestId ?? crypto.randomUUID();
  return NextResponse.json(
    { error: { code, message, requestId, ...(options.details ? { details: options.details } : {}) } },
    {
      status,
      headers: {
        ...SECURE_HEADERS,
        "X-Request-Id": requestId,
        ...(options.headers ?? {}),
      },
    },
  );
}
