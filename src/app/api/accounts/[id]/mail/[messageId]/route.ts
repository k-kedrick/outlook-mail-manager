import { fail, logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchMessage, type MailSource } from "@/lib/outlook/mail";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id, messageId } = await params;
    const sourceParam = new URL(request.url).searchParams.get("source");
    const source: MailSource | undefined =
      sourceParam === "graph" || sourceParam === "outlook" || sourceParam === "imap"
        ? sourceParam
        : undefined;

    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return fail("账号不存在。", 404);

    try {
      const message = await fetchMessage(account, messageId, source);
      return ok({ message });
    } catch (mailError) {
      const request = requestId();
      logPublicError(
        "mail-message",
        request,
        mailError,
        mailError instanceof Error ? mailError.name : typeof mailError,
        account.id,
      );
      return fail("暂时无法读取邮件正文，请重新加载后重试。", 502, { requestId: request });
    }
  } catch (error) {
    return routeError(error);
  }
}
