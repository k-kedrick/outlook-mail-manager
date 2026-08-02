export type RiskLevel = "FRESH" | "WARN" | "DANGER";

// ---- generic pill (header stats / meta) ----
export type PillTone = "muted" | "green" | "accent" | "teal" | "amber" | "rose";

const PILL_TONES: Record<PillTone, string> = {
  muted: "bg-surface2/70 text-muted border-line/80",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  accent: "bg-accent/10 text-indigo-300 border-accent/25",
  teal: "bg-teal/10 text-teal border-teal/25",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  rose: "bg-rose-500/10 text-rose-300 border-rose-500/25",
};

export function Pill({
  tone = "muted",
  dot,
  children,
}: {
  tone?: PillTone;
  dot?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${PILL_TONES[tone]}`}
    >
      {dot && <i className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

// ---- account status badge ----
const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  OK: { label: "正常", cls: "text-emerald-300", dot: "bg-emerald-400" },
  AUTH_FAILED: { label: "令牌失效", cls: "text-rose-300", dot: "bg-rose-400" },
  LOCKED: { label: "已锁定", cls: "text-amber-300", dot: "bg-amber-400" },
  ERROR: { label: "错误", cls: "text-orange-300", dot: "bg-orange-400" },
  UNKNOWN: { label: "未检测", cls: "text-slate-300", dot: "bg-slate-400" },
};

export function StatusBadge({ status }: { status: string }): React.ReactNode {
  const m = STATUS_META[status] ?? STATUS_META.UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${m.cls}`}
    >
      <i className={`h-1.5 w-1.5 rounded-full shadow-[0_0_10px_currentColor] ${m.dot}`} />
      {m.label}
    </span>
  );
}

export const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "OK", label: "正常" },
  { value: "AUTH_FAILED", label: "令牌失效" },
  { value: "LOCKED", label: "已锁定" },
  { value: "ERROR", label: "错误" },
  { value: "UNKNOWN", label: "未检测" },
];

// ---- refresh-token remaining validity ----
const RISK_TEXT: Record<string, string> = {
  FRESH: "text-emerald-300",
  WARN: "text-amber-300",
  DANGER: "text-rose-300",
};

export function RiskBadge({
  level,
  days,
  expiresAt,
}: {
  level: string;
  days: number;
  expiresAt?: string | null;
}): React.ReactNode {
  const text = RISK_TEXT[level] ?? RISK_TEXT.WARN;
  const dot = level === "DANGER" ? "bg-rose-400" : level === "WARN" ? "bg-amber-400" : "bg-emerald-400";
  const title = expiresAt
    ? `到期：${new Date(expiresAt).toLocaleString("zh-CN", { hour12: false })}`
    : undefined;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${text}`} title={title}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {days <= 0 ? "已过期" : `剩余 ${days} 天`}
    </span>
  );
}
