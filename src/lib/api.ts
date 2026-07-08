import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ error: { message, details } }, { status });
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldMessage = Object.values(flattened.fieldErrors)
      .flat()
      .find((message): message is string => Boolean(message));
    const formMessage = flattened.formErrors.find(Boolean);
    return fail(fieldMessage || formMessage || "请求参数不正确。", 422, flattened);
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return fail("数据库操作失败，请稍后重试。", 500);
  }

  if (
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return fail("数据库服务暂时不可用，请稍后重试。", 500);
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return fail("请先登录。", 401);
    }
    return fail(error.message || "请求失败。", 400);
  }

  return fail("请求失败。", 500);
}
