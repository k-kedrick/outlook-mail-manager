import { X } from "lucide-react";

export function Dialog({
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}): React.ReactNode {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={`flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card`}
      >
        <div className="flex items-center justify-between border-b border-line bg-surface2/30 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-muted transition-colors hover:text-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line bg-surface2/20 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
