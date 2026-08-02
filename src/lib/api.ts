import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export function fail(message: string, status = 400, details?: unknown, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ error: { message, details } }, { status, headers: { ...NO_STORE_HEADERS, ...(headers ?? {}) } });
}

export function rateLimited(retryAfter: number): NextResponse {
  return fail("请求过于频繁，请稍后再试。", 429, undefined, { "Retry-After": String(retryAfter) });
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function logPublicError(scope: string, id: string, error: unknown, category?: string, subjectId?: string): void {
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(
    `[${scope}] request=${id} error=${kind}${category ? ` category=${category}` : ""}${subjectId ? ` subject=${subjectId}` : ""}`,
  );
}

export function routeError(error: unknown): NextResponse {
  const id = requestId();
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldMessage = Object.values(flattened.fieldErrors)
      .flat()
      .find((message): message is string => Boolean(message));
    const formMessage = flattened.formErrors.find(Boolean);
    return fail(fieldMessage || formMessage || "请求参数不正确。", 422, { ...flattened, requestId: id });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    logPublicError("api", id, error, "DATABASE_ERROR");
    return fail("数据库操作失败，请稍后重试。", 500, { requestId: id });
  }

  if (
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    logPublicError("api", id, error, "DATABASE_UNAVAILABLE");
    return fail("数据库服务暂时不可用，请稍后重试。", 500, { requestId: id });
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return fail("请先登录。", 401, { requestId: id });
    }
    logPublicError("api", id, error, "UNEXPECTED_ERROR");
    return fail("请求处理失败，请稍后重试。", 500, { requestId: id });
  }

  logPublicError("api", id, error, "UNKNOWN_ERROR");
  return fail("请求失败。", 500, { requestId: id });
}
