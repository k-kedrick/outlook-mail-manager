import { z } from "zod";
import { decryptValue, encryptValue } from "@/shared/crypto/keyring";
import { ProviderError } from "./provider-error";

const tokenSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["cursor", "message"]),
  protocol: z.enum(["graph", "imap", "outlook_rest_legacy"]),
  folder: z.enum(["inbox", "junk"]),
  value: z.string().min(1),
  expiresAt: z.number().int().positive().optional(),
});

export type OpaqueMailToken = z.infer<typeof tokenSchema>;

export function encodeMailToken(payload: OpaqueMailToken): string {
  return encryptValue(JSON.stringify(payload)).ciphertext;
}

export function decodeMailToken(value: string, expectedKind: OpaqueMailToken["kind"]): OpaqueMailToken {
  try {
    const parsed = tokenSchema.parse(JSON.parse(decryptValue(value)));
    if (parsed.kind !== expectedKind) throw new Error("wrong token kind");
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      throw new ProviderError("CURSOR_EXPIRED", false, "Mail cursor expired");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("INVALID_CURSOR", false, "Invalid opaque mail token");
  }
}
