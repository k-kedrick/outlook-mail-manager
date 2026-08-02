import type { MailProtocol } from "./mail-provider";
import type { ProviderError } from "./provider-error";

export type CapabilityState = "unknown" | "available" | "denied" | "disabled" | "temporary_failure";

export type ProtocolCapability = {
  protocol: MailProtocol;
  state: CapabilityState;
  consecutiveFailures: number;
  circuitOpenUntil: Date | null;
  retryAfterAt: Date | null;
  lastSuccessAt: Date | null;
};

export interface CapabilityRepository {
  list(accountId: string): Promise<ProtocolCapability[]>;
  recordSuccess(accountId: string, protocol: MailProtocol, now: Date): Promise<void>;
  recordFailure(accountId: string, protocol: MailProtocol, error: ProviderError, now: Date): Promise<void>;
}
