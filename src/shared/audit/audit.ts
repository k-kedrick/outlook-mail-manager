import type { AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { hmacValue } from "@/shared/crypto/hash";

export async function recordAudit(input: {
  adminId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: AuditOutcome;
  requestId: string;
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      outcome: input.outcome,
      requestId: input.requestId,
      ipHash: input.ip ? hmacValue(input.ip) : undefined,
      metadata: input.metadata,
    },
  });
}
