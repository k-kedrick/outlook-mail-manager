import { DEFAULT_REFRESH_TOKEN_TTL_DAYS } from "./oauth";

export type RiskLevel = "FRESH" | "WARN" | "DANGER";

// Remaining-validity thresholds (days left before the refresh token expires).
export const WARN_DAYS = 30; // ≤30 days left → 注意
export const DANGER_DAYS = 7; // ≤7 days left (or expired) → 危险

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Effective refresh-token expiry: the stored value, or a fallback of
 * (last refresh | created) + 90 days for rows predating the expiry model.
 */
export function effectiveExpiry(
  refreshTokenExpiresAt: Date | null | undefined,
  refreshTokenUpdatedAt: Date | null | undefined,
  createdAt: Date,
): Date {
  if (refreshTokenExpiresAt) return refreshTokenExpiresAt;
  const anchor = refreshTokenUpdatedAt ?? createdAt;
  return new Date(anchor.getTime() + DEFAULT_REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY);
}

/** Days of validity remaining, rounded up so a just-refreshed token reads 90. */
export function remainingDays(expiry: Date): number {
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / MS_PER_DAY));
}

export function riskFromRemaining(days: number): RiskLevel {
  if (days <= DANGER_DAYS) return "DANGER";
  if (days <= WARN_DAYS) return "WARN";
  return "FRESH";
}

export function refreshRisk(
  refreshTokenExpiresAt: Date | null | undefined,
  refreshTokenUpdatedAt: Date | null | undefined,
  createdAt: Date,
): { remainingValidityDays: number; riskLevel: RiskLevel } {
  const expiry = effectiveExpiry(refreshTokenExpiresAt, refreshTokenUpdatedAt, createdAt);
  const days = remainingDays(expiry);
  return { remainingValidityDays: days, riskLevel: riskFromRemaining(days) };
}
