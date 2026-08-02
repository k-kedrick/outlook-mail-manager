import { logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, safeIssueForError, type BatchIssue } from "@/lib/batch-feedback";
import { prisma } from "@/lib/prisma";
import { DEFAULT_REFRESH_TOKEN_TTL_DAYS } from "@/lib/outlook/oauth";
import { parseAccounts } from "@/lib/outlook/parse";
import { encryptSecret } from "@/lib/secrets";
import { importSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { text, groupId } = importSchema.parse(await request.json());
    const parsed = parseAccounts(text);
    const id = requestId();

    let created = 0;
    let updated = 0;
    let totpUpdated = 0;
    const notFound: string[] = [];
    const issues: BatchIssue[] = parsed.invalid.map((invalid) => ({
      id: `line-${invalid.line}`,
      outcome: "failed",
      reasonCode: "INVALID_INPUT",
      message: invalid.reason.startsWith("邮箱格式无效")
        ? "邮箱格式无效。"
        : invalid.reason.startsWith("ClientId 格式可疑")
          ? "ClientId 格式无效。"
          : invalid.reason,
    }));
    for (let index = 0; index < parsed.duplicateInInput; index += 1) {
      issues.push({
        id: `duplicate-${index + 1}`,
        outcome: "skipped",
        reasonCode: "DUPLICATE_INPUT",
        message: "输入中存在重复邮箱，已跳过重复行。",
      });
    }

    for (const acc of parsed.ok) {
      try {
        const existing = await prisma.mailAccount.findUnique({
          where: { email: acc.email },
          select: { id: true },
        });

        // 2-segment form: patch ONLY the authenticator secret on an existing account.
        // Never touches credentials / status / cached tokens.
        if (acc.kind === "totpOnly") {
          if (!existing) {
            notFound.push(acc.email);
            issues.push({
              email: acc.email,
              outcome: "not_found",
              reasonCode: "ACCOUNT_NOT_FOUND",
              message: "邮箱不存在，无法补充身份验证器密钥。",
            });
            continue;
          }
          await prisma.mailAccount.update({
            where: { email: acc.email },
            data: { totpSecretCipher: encryptSecret(acc.totp) },
          });
          totpUpdated += 1;
          continue;
        }

        const data = {
          passwordCipher: encryptSecret(acc.password),
          clientId: acc.clientId,
          refreshTokenCipher: encryptSecret(acc.refreshToken),
          // A re-import means the credentials changed — invalidate cached tokens/status,
          // relearn protocol, and (re)start the 90-day validity clock from now.
          status: "UNKNOWN",
          lastError: null,
          mailProtocol: null,
          refreshTokenUpdatedAt: new Date(),
          refreshTokenExpiresAt: new Date(
            Date.now() + DEFAULT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
          ),
          graphTokenCipher: null,
          graphTokenExpiresAt: null,
          imapTokenCipher: null,
          imapTokenExpiresAt: null,
          // Only set the 2FA secret when the line actually carries one — a plain
          // credential re-import must not wipe an already-configured authenticator.
          ...(acc.totp ? { totpSecretCipher: encryptSecret(acc.totp) } : {}),
          ...(groupId ? { groupId } : {}),
        };

        if (existing) {
          await prisma.mailAccount.update({ where: { email: acc.email }, data });
          updated += 1;
        } else {
          await prisma.mailAccount.create({ data: { email: acc.email, ...data } });
          created += 1;
        }
      } catch (error) {
        logPublicError("accounts-import", id, error, "PROCESSING_ERROR");
        issues.push(safeIssueForError(undefined, acc.email));
      }
    }

    const requested = text.split(/\r?\n/).filter((line) => line.trim()).length;
    return ok({
      created,
      updated,
      totpUpdated,
      notFound,
      total: parsed.ok.length,
      duplicateInInput: parsed.duplicateInInput,
      invalid: parsed.invalid.map((invalid) => ({ ...invalid, raw: "[REDACTED]" })),
      feedback: buildBatchFeedback({
        requestId: id,
        requested,
        succeeded: created + updated + totpUpdated,
        issues,
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
