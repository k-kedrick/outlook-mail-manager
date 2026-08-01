import { NextResponse } from "next/server";
import { oauthFlowService } from "@/modules/oauth/composition";
import { OAuthDomainError } from "@/modules/oauth/domain/oauth";
import { env } from "@/shared/config/env";
import { logger } from "@/shared/logging/logger";

function resultRedirect(params: Record<string, string>): NextResponse {
  const url = new URL("/", env().NEXT_PUBLIC_APP_URL);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const microsoftError = url.searchParams.get("error");
  if (microsoftError || !code || !state) {
    logger({ component: "oauth-callback", requestId }).warn({ category: microsoftError ?? "INVALID_CALLBACK" }, "oauth callback rejected");
    return resultRedirect({ oauth: "failed", code: microsoftError ?? "INVALID_CALLBACK", requestId });
  }
  try {
    const result = await oauthFlowService.callback(code, state);
    return resultRedirect({ oauth: "success", resource: result.resource, accountId: result.account.id });
  } catch (error) {
    const category = error instanceof OAuthDomainError ? error.code : "OAUTH_CALLBACK_FAILED";
    logger({ component: "oauth-callback", requestId }).warn({ category }, "oauth callback failed");
    return resultRedirect({ oauth: "failed", code: category, requestId });
  }
}
