import { z } from "zod";
import { isValidBase32Secret } from "@/lib/totp";

export const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

export const importSchema = z.object({
  text: z.string().min(1).max(2_000_000),
  groupId: z.string().trim().min(1).optional().nullable(),
});

export const accountPatchSchema = z.object({
  note: z.string().max(2000).optional().nullable(),
  groupId: z.string().trim().min(1).nullable().optional(),
  status: z.enum(["UNKNOWN", "OK", "AUTH_FAILED", "LOCKED", "ERROR"]).optional(),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
});

export const bulkGroupSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
  groupId: z.string().trim().min(1).nullable(),
});

export const totpSecretSchema = z.object({
  secret: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .refine((value) => isValidBase32Secret(value), "身份验证器密钥格式无效（应为 base32）"),
});

export const cardKeyGenerateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
  // Prefix is optional; letters/digits/dash/underscore only, kept short.
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9_-]*$/, "前缀只能包含字母、数字、- 或 _")
    .optional()
    .default(""),
  regenerate: z.boolean().optional().default(false),
});

export const redeemSchema = z.object({
  code: z.string().trim().min(1).max(80),
});

export const settingsSchema = z.object({
  refreshEnabled: z.boolean().optional(),
  refreshIntervalDays: z.number().int().min(1).max(90).optional(),
  statusCheckEnabled: z.boolean().optional(),
  statusCheckIntervalMinutes: z.number().int().min(5).max(10080).optional(),
  codePollEnabled: z.boolean().optional(),
  codePollIntervalSeconds: z.number().int().min(10).max(86400).optional(),
});

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(20).optional().nullable(),
});

export const groupPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().trim().max(20).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
