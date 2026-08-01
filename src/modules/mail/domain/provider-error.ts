export type ProviderErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "MAILBOX_DISABLED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "MESSAGE_NOT_FOUND"
  | "CURSOR_EXPIRED"
  | "INVALID_CURSOR";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function publicProviderMessage(code: ProviderErrorCode): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Microsoft 授权已失效，请重新授权。";
    case "PERMISSION_DENIED":
      return "当前授权没有读取邮箱的权限。";
    case "MAILBOX_DISABLED":
      return "当前邮箱未启用该取件通道。";
    case "RATE_LIMITED":
      return "Microsoft 暂时限制了请求频率，请稍后重试。";
    case "MESSAGE_NOT_FOUND":
      return "邮件不存在或已经被删除。";
    case "CURSOR_EXPIRED":
      return "分页状态已过期，请重新加载。";
    case "INVALID_CURSOR":
      return "分页参数无效。";
    case "NETWORK_ERROR":
    case "PROVIDER_UNAVAILABLE":
      return "邮件服务暂时不可用，请稍后重试。";
  }
}
