import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/shared/config/env";

const VERSION = "v2";

type Keyring = { primaryId: string; keys: Map<string, Buffer> };

function deriveKey(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function parseKeyring(input: string): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of input.split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) throw new Error("DATA_ENCRYPTION_KEYS entries must use key-id:secret");
    const id = entry.slice(0, separator).trim();
    const secret = entry.slice(separator + 1).trim();
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id) || secret.length < 32 || keys.has(id)) {
      throw new Error("DATA_ENCRYPTION_KEYS contains an invalid or duplicate entry");
    }
    keys.set(id, deriveKey(secret));
  }
  const primaryId = keys.keys().next().value as string | undefined;
  if (!primaryId) throw new Error("DATA_ENCRYPTION_KEYS must contain at least one key");
  return { primaryId, keys };
}

function activeKeyring(): Keyring {
  return parseKeyring(env().DATA_ENCRYPTION_KEYS);
}

export type EncryptedValue = { ciphertext: string; keyId: string };

export function encryptValue(value: string): EncryptedValue {
  const keyring = activeKeyring();
  const key = keyring.keys.get(keyring.primaryId) as Buffer;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyId: keyring.primaryId,
    ciphertext: [
      VERSION,
      keyring.primaryId,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(":"),
  };
}

export function decryptValue(ciphertext: string): string {
  const [version, keyId, iv, tag, encrypted] = ciphertext.split(":");
  if (version !== VERSION || !keyId || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted value format");
  }
  const key = activeKeyring().keys.get(keyId);
  if (!key) throw new Error(`Encryption key ${keyId} is not available`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
