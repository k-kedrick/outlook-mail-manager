const DEFAULT_APP_SECRET = "development-only-change-this-secret";
const DEFAULT_ADMIN_PASSWORD = "change-me";

export function appSecret(): string {
  const value = process.env.APP_SECRET;
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32 || value === DEFAULT_APP_SECRET)) {
    throw new Error("APP_SECRET must be unique and at least 32 characters in production");
  }
  return value || DEFAULT_APP_SECRET;
}

export function adminPassword(): string {
  const value = process.env.ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production" && (!value || value === DEFAULT_ADMIN_PASSWORD)) {
    throw new Error("ADMIN_PASSWORD must be set to a non-default value in production");
  }
  return value || DEFAULT_ADMIN_PASSWORD;
}

export function validateProductionEnv(): void {
  appSecret();
  adminPassword();
}
