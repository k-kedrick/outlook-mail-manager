import { PrismaAccountRepository } from "@/modules/accounts/infrastructure/prisma-account-repository";
import { tokenBroker } from "@/modules/oauth/composition";
import { MailRouter } from "./application/mail-router";
import { GraphMailProvider } from "./infrastructure/graph/graph-provider";
import { ImapMailProvider } from "./infrastructure/imap/imap-provider";
import { OutlookRestLegacyProvider } from "./infrastructure/outlook-rest-legacy/outlook-rest-provider";
import { PrismaCapabilityRepository } from "./infrastructure/prisma-capability-repository";

export const mailRouter = new MailRouter(
  [new GraphMailProvider(), new ImapMailProvider(), new OutlookRestLegacyProvider()],
  new PrismaAccountRepository(),
  new PrismaCapabilityRepository(),
  tokenBroker,
);
