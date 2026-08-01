import { CardKeyService } from "./application/card-key-service";
import { CodeRequestService } from "./application/code-request-service";
import { jobRepository } from "@/modules/jobs/composition";
import { mailRouter } from "@/modules/mail/composition";
import { PrismaCardKeyRepository, PrismaCodeRequestRepository } from "./infrastructure/prisma-redemption-repository";

export const cardKeyService = new CardKeyService(new PrismaCardKeyRepository());
export const codeRequestService = new CodeRequestService(
  cardKeyService,
  jobRepository,
  mailRouter,
  new PrismaCodeRequestRepository(),
);
