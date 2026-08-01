import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type {
  CardKeyAccount,
  CardKeyRepository,
  CodeRequestRecord,
  CodeRequestRepository,
  ResolvedCardKey,
} from "../domain/redemption";
import { CardKeyCollisionError } from "../domain/redemption";

export class PrismaCardKeyRepository implements CardKeyRepository {
  async findAccounts(ids: string[]): Promise<CardKeyAccount[]> {
    const accounts = await prisma.mailAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, cardKey: { select: { id: true } } },
    });
    return accounts.map((account) => ({ id: account.id, email: account.email, hasCardKey: Boolean(account.cardKey) }));
  }

  async save(input: { accountId: string; codeHash: string; codePrefix: string | null; codeLast4: string }): Promise<void> {
    try {
      await prisma.cardKey.upsert({
        where: { accountId: input.accountId },
        create: {
          accountId: input.accountId,
          codeHash: input.codeHash,
          codePrefix: input.codePrefix,
          codeLast4: input.codeLast4,
        },
        update: {
          codeHash: input.codeHash,
          codePrefix: input.codePrefix,
          codeLast4: input.codeLast4,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CardKeyCollisionError();
      }
      throw error;
    }
  }

  async findByHash(codeHash: string): Promise<ResolvedCardKey | null> {
    return prisma.cardKey.findUnique({
      where: { codeHash },
      select: {
        id: true,
        accountId: true,
        account: { select: { email: true, secret: { select: { totpCipher: true } } } },
      },
    });
  }
}

function mapRequest(request: {
  id: string;
  accountId: string;
  status: string;
  resultCodeCipher: string | null;
  resultSubject: string | null;
  resultFrom: string | null;
  resultReceivedAt: Date | null;
  lastErrorCode: string | null;
  expiresAt: Date;
}): CodeRequestRecord {
  return { ...request, status: request.status.toLowerCase() as CodeRequestRecord["status"] };
}

const requestSelect = {
  id: true,
  accountId: true,
  status: true,
  resultCodeCipher: true,
  resultSubject: true,
  resultFrom: true,
  resultReceivedAt: true,
  lastErrorCode: true,
  expiresAt: true,
} satisfies Prisma.CodeRequestSelect;

export class PrismaCodeRequestRepository implements CodeRequestRepository {
  async create(input: { accountId: string; cardKeyId: string; retrievalTokenHash: string; expiresAt: Date }): Promise<CodeRequestRecord> {
    return mapRequest(await prisma.codeRequest.create({ data: input, select: requestSelect }));
  }

  async findByCredential(id: string, retrievalTokenHash: string): Promise<CodeRequestRecord | null> {
    const request = await prisma.codeRequest.findFirst({ where: { id, retrievalTokenHash }, select: requestSelect });
    return request ? mapRequest(request) : null;
  }

  async findById(id: string): Promise<CodeRequestRecord | null> {
    const request = await prisma.codeRequest.findUnique({ where: { id }, select: requestSelect });
    return request ? mapRequest(request) : null;
  }

  async markRunning(id: string): Promise<void> { await prisma.codeRequest.update({ where: { id }, data: { status: "RUNNING" } }); }
  async markPending(id: string): Promise<void> { await prisma.codeRequest.update({ where: { id }, data: { status: "PENDING" } }); }
  async markExpired(id: string): Promise<void> { await prisma.codeRequest.update({ where: { id }, data: { status: "EXPIRED", completedAt: new Date(), lastErrorCode: "CODE_NOT_FOUND" } }); }
  async markFailed(id: string, errorCode: string): Promise<void> { await prisma.codeRequest.update({ where: { id }, data: { status: "FAILED", completedAt: new Date(), lastErrorCode: errorCode } }); }
  async markFound(input: { id: string; resultCodeCipher: string; resultKeyId: string; subject: string; from: string; receivedAt: Date }): Promise<void> {
    await prisma.codeRequest.update({
      where: { id: input.id },
      data: {
        status: "FOUND",
        resultCodeCipher: input.resultCodeCipher,
        resultKeyId: input.resultKeyId,
        resultSubject: input.subject,
        resultFrom: input.from,
        resultReceivedAt: input.receivedAt,
        completedAt: new Date(),
        lastErrorCode: null,
      },
    });
  }
}
