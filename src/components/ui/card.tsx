export function Card({
  className = "",
  glow = false,
  children,
}: {
  className?: string;
  glow?: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`rounded-lg border border-line bg-surface shadow-card ${glow ? "shadow-glow" : ""} ${className}`}>
      {children}
    </div>
  );
}
