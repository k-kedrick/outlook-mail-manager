import { randomBytes } from "node:crypto";
import type { MailRoutingService } from "@/modules/mail/domain/mail-provider";
import { JOB_TYPES } from "@/modules/jobs/domain/job";
import type { JobRepository } from "@/modules/jobs/domain/job";
import { JobExecutionError } from "@/modules/jobs/domain/job-error";
import { decryptValue, encryptValue } from "@/shared/crypto/keyring";
import { sha256 } from "@/shared/crypto/hash";
import { extractVerificationCode, type CodeWatchExecutor } from "../domain/code-extractor";
import type { CodeRequestRepository } from "../domain/redemption";
import type { CardKeyService } from "./card-key-service";

const REQUEST_TTL_MS = 10 * 60_000;

export class CodeRequestService implements CodeWatchExecutor {
  constructor(
    private readonly cardKeys: CardKeyService,
    private readonly jobs: JobRepository,
    private readonly mail: MailRoutingService,
    private readonly requests: CodeRequestRepository,
  ) {}

  async create(cardCode: string): Promise<{
    requestId: string;
    retrievalToken: string;
    pollAfterMs: number;
    email: string;
    hasTotp: boolean;
    expiresAt: Date;
  }> {
    const cardKey = await this.cardKeys.resolve(cardCode);
    if (!cardKey) throw new JobExecutionError("CARD_KEY_INVALID", false, "Card key is invalid");
    const retrievalToken = randomBytes(32).toString("base64url");
    const codeRequest = await this.requests.create({
      accountId: cardKey.accountId,
      cardKeyId: cardKey.id,
      retrievalTokenHash: sha256(retrievalToken),
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    });
    await this.jobs.enqueue({
      type: JOB_TYPES.CODE_WATCH,
      accountId: cardKey.accountId,
      payload: { codeRequestId: codeRequest.id },
      dedupeKey: `code-watch:${codeRequest.id}`,
      priority: 20,
      maxAttempts: 60,
    });
    return {
      requestId: codeRequest.id,
      retrievalToken,
      pollAfterMs: 2_000,
      email: cardKey.account.email,
      hasTotp: Boolean(cardKey.account.secret?.totpCipher),
      expiresAt: codeRequest.expiresAt,
    };
  }

  async status(requestId: string, retrievalToken: string) {
    const request = await this.requests.findByCredential(requestId, sha256(retrievalToken));
    if (!request) throw new JobExecutionError("CODE_REQUEST_NOT_FOUND", false, "Code request does not exist");
    return {
      status: request.status,
      code: request.resultCodeCipher ? decryptValue(request.resultCodeCipher) : null,
      subject: request.resultSubject,
      from: request.resultFrom,
      receivedAt: request.resultReceivedAt,
      errorCode: request.lastErrorCode,
      expiresAt: request.expiresAt,
    };
  }

  async execute(codeRequestId: string): Promise<{ found: boolean }> {
    const request = await this.requests.findById(codeRequestId);
    if (!request) throw new JobExecutionError("CODE_REQUEST_NOT_FOUND", false, "Code request does not exist");
    if (request.status === "found") return { found: true };
    if (request.expiresAt <= new Date()) {
      await this.requests.markExpired(request.id);
      throw new JobExecutionError("CODE_NOT_FOUND", false, "Code watch expired");
    }
    await this.requests.markRunning(request.id);
    try {
      const hits: Array<{ code: string; subject: string; from: string; receivedAt: Date }> = [];
      for (const folder of ["inbox", "junk"] as const) {
        const page = await this.mail.list({ accountId: request.accountId, folder, limit: 20 }).catch(() => null);
        if (!page) continue;
        for (const summary of page.messages.slice(0, 12)) {
          let code = extractVerificationCode(summary);
          let message = summary;
          if (!code) {
            message = await this.mail.getMessage({ accountId: request.accountId, folder, messageId: summary.id }).catch(() => summary);
            code = extractVerificationCode(message);
          }
          if (code) {
            hits.push({ code, subject: message.subject, from: message.from, receivedAt: new Date(message.receivedAt ?? 0) });
            break;
          }
        }
      }
      hits.sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime());
      const hit = hits[0];
      if (!hit) {
        await this.requests.markPending(request.id);
        throw new JobExecutionError("CODE_NOT_FOUND_YET", true, "Verification code not found yet", 10_000);
      }
      const encrypted = encryptValue(hit.code);
      await this.requests.markFound({
        id: request.id,
        resultCodeCipher: encrypted.ciphertext,
        resultKeyId: encrypted.keyId,
        subject: hit.subject,
        from: hit.from,
        receivedAt: hit.receivedAt,
      });
      return { found: true };
    } catch (error) {
      if (error instanceof JobExecutionError) throw error;
      await this.requests.markFailed(request.id, "MAIL_READ_FAILED");
      throw new JobExecutionError("MAIL_READ_FAILED", true, "Mail read failed");
    }
  }
}
