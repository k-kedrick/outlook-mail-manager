import { PrismaAccountRepository } from "@/modules/accounts/infrastructure/prisma-account-repository";
import { OAuthFlowService } from "./application/oauth-flow-service";
import { TokenBroker } from "./application/token-broker";
import { MicrosoftOAuthClient } from "./infrastructure/microsoft-oauth-client";
import { PrismaOAuthRepository } from "./infrastructure/prisma-oauth-repository";

const oauthRepository = new PrismaOAuthRepository();
const microsoftClient = new MicrosoftOAuthClient();

export const oauthFlowService = new OAuthFlowService(
  oauthRepository,
  new PrismaAccountRepository(),
  microsoftClient,
);
export const tokenBroker = new TokenBroker(oauthRepository, microsoftClient);
