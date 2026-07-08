import type { ButtonHTMLAttributes } from "react";
import { RefreshCw } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "accentSoft"
  | "tealSoft";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-600 border border-transparent shadow-sm",
  secondary: "bg-surface2/80 text-slate-200 border border-line2/80 hover:border-accent/45 hover:bg-surface2 hover:text-white",
  ghost: "text-muted hover:text-slate-100 hover:bg-surface2/70 border border-transparent",
  danger: "bg-rose-600/95 text-white hover:bg-rose-500 border border-transparent",
  accentSoft: "bg-accent/12 text-indigo-300 border border-accent/25 hover:bg-accent/20 hover:text-indigo-200",
  tealSoft: "bg-teal/12 text-teal border border-teal/25 hover:bg-teal/20 hover:text-teal",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  children,
  className = "",
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>): React.ReactNode {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <RefreshCw className="animate-spin" size={size === "sm" ? 13 : 15} /> : icon}
      {children}
    </button>
  );
}

/** Square icon-only button for table rows / compact spots. */
export function IconButton({
  title,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): React.ReactNode {
  return (
    <button
      {...props}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2/80 hover:text-slate-100 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
