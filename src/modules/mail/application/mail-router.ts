import type { AccountRepository } from "@/modules/accounts/domain/account";
import type { TokenBroker } from "@/modules/oauth/application/token-broker";
import type { CapabilityRepository, ProtocolCapability } from "../domain/capability";
import type {
  MailFolder,
  MailPage,
  MailProtocol,
  MailProvider,
  MailMessage,
  TokenProfile,
} from "../domain/mail-provider";
import { decodeMailToken } from "../domain/opaque-token";
import { ProviderError } from "../domain/provider-error";
import { metrics } from "@/shared/observability/metrics";

const DEFAULT_ORDER: MailProtocol[] = ["graph", "imap", "outlook_rest_legacy"];

function canAttempt(protocol: MailProtocol, capability: ProtocolCapability | undefined, now: Date): boolean {
  if (protocol === "outlook_rest_legacy" && capability?.state !== "available") return false;
  if (!capability) return true;
  if (capability.state === "denied" || capability.state === "disabled") return false;
  if (capability.circuitOpenUntil && capability.circuitOpenUntil > now) return false;
  if (capability.retryAfterAt && capability.retryAfterAt > now) return false;
  return true;
}

export class MailRouter {
  private readonly providers: Map<MailProtocol, MailProvider>;

  constructor(
    providers: MailProvider[],
    private readonly accounts: AccountRepository,
    private readonly capabilities: CapabilityRepository,
    private readonly tokens: TokenBroker,
  ) {
    this.providers = new Map(providers.map((provider) => [provider.protocol, provider]));
  }

  async list(input: { accountId: string; folder: MailFolder; limit: number; cursor?: string }): Promise<MailPage> {
    const account = await this.requireAccount(input.accountId);
    if (input.cursor) {
      const reference = decodeMailToken(input.cursor, "cursor");
      const provider = this.requireProvider(reference.protocol);
      return this.execute(account.id, provider, "list", () =>
        provider.listMessages({
          account,
          folder: input.folder,
          limit: input.limit,
          cursor: input.cursor,
          resolveToken: this.resolveToken,
        }),
      );
    }
    const capabilityList = await this.capabilities.list(account.id);
    const capabilityMap = new Map(capabilityList.map((capability) => [capability.protocol, capability]));
    const order = [account.preferredProtocol, ...DEFAULT_ORDER].filter(
      (protocol, index, list): protocol is MailProtocol => Boolean(protocol) && list.indexOf(protocol) === index,
    );
    let lastError: ProviderError | undefined;
    for (const protocol of order) {
      if (!canAttempt(protocol, capabilityMap.get(protocol), new Date())) continue;
      const provider = this.requireProvider(protocol);
      try {
        return await this.execute(account.id, provider, "list", () =>
          provider.listMessages({
            account,
            folder: input.folder,
            limit: input.limit,
            resolveToken: this.resolveToken,
          }),
        );
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new ProviderError("AUTH_REQUIRED", false, "No mail provider is available");
  }

  async getMessage(input: { accountId: string; folder: MailFolder; messageId: string }): Promise<MailMessage> {
    const account = await this.requireAccount(input.accountId);
    const reference = decodeMailToken(input.messageId, "message");
    const provider = this.requireProvider(reference.protocol);
    return this.execute(account.id, provider, "message", () =>
      provider.getMessage({
        account,
        folder: input.folder,
        messageId: input.messageId,
        resolveToken: this.resolveToken,
      }),
    );
  }

  async health(accountId: string): Promise<{ protocol: MailProtocol; available: true }> {
    const account = await this.requireAccount(accountId);
    const capabilityList = await this.capabilities.list(account.id);
    const capabilityMap = new Map(capabilityList.map((capability) => [capability.protocol, capability]));
    const available = capabilityList
      .filter((capability) => capability.state === "available")
      .sort((left, right) => (right.lastSuccessAt?.getTime() ?? 0) - (left.lastSuccessAt?.getTime() ?? 0))
      .map((capability) => capability.protocol);
    const order = [account.preferredProtocol, ...available, ...DEFAULT_ORDER].filter(
      (protocol, index, list): protocol is MailProtocol => Boolean(protocol) && list.indexOf(protocol) === index,
    );
    const protocol = order.find((candidate) => canAttempt(candidate, capabilityMap.get(candidate), new Date()));
    if (!protocol) throw new ProviderError("AUTH_REQUIRED", false, "No learned mail provider is available");
    const provider = this.requireProvider(protocol);
    await this.execute(account.id, provider, "probe", () =>
      provider.probe({ account, resolveToken: this.resolveToken }),
    );
    return { protocol, available: true };
  }

  async probe(accountId: string): Promise<Array<{ protocol: MailProtocol; available: boolean; errorCode?: string }>> {
    const account = await this.requireAccount(accountId);
    const results: Array<{ protocol: MailProtocol; available: boolean; errorCode?: string }> = [];
    for (const protocol of DEFAULT_ORDER) {
      if (protocol === "outlook_rest_legacy") {
        const capability = (await this.capabilities.list(account.id)).find((entry) => entry.protocol === protocol);
        if (!capability) continue;
      }
      const provider = this.requireProvider(protocol);
      try {
        await this.execute(account.id, provider, "probe", () =>
          provider.probe({ account, resolveToken: this.resolveToken }),
        );
        results.push({ protocol, available: true });
      } catch (error) {
        const code = error instanceof ProviderError ? error.code : "PROVIDER_UNAVAILABLE";
        results.push({ protocol, available: false, errorCode: code });
      }
    }
    return results;
  }

  private readonly resolveToken = (accountId: string, profile: TokenProfile): Promise<string> =>
    this.tokens.getAccessToken(accountId, profile);

  private async requireAccount(accountId: string) {
    const account = await this.accounts.findById(accountId);
    if (!account) throw new ProviderError("MESSAGE_NOT_FOUND", false, "Account does not exist");
    return { id: account.id, email: account.email, preferredProtocol: account.preferredProtocol };
  }

  private requireProvider(protocol: MailProtocol): MailProvider {
    const provider = this.providers.get(protocol);
    if (!provider) throw new ProviderError("PROVIDER_UNAVAILABLE", false, `Provider ${protocol} is not registered`);
    return provider;
  }

  private async execute<T>(
    accountId: string,
    provider: MailProvider,
    operation: "list" | "message" | "probe",
    action: () => Promise<T>,
  ): Promise<T> {
    const stopTimer = metrics.providerDuration.startTimer({ provider: provider.protocol, operation });
    try {
      const result = await action();
      await this.capabilities.recordSuccess(accountId, provider.protocol, new Date());
      metrics.providerRequests.inc({ provider: provider.protocol, operation, outcome: "succeeded" });
      return result;
    } catch (error) {
      const providerError = error instanceof ProviderError
        ? error
        : new ProviderError("PROVIDER_UNAVAILABLE", true, "Provider operation failed");
      await this.capabilities.recordFailure(accountId, provider.protocol, providerError, new Date());
      metrics.providerRequests.inc({ provider: provider.protocol, operation, outcome: providerError.code });
      throw providerError;
    } finally {
      stopTimer();
    }
  }
}
