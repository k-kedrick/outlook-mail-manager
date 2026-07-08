// Shared control styling so inputs/selects/textareas look consistent.
export const fieldBase =
  "rounded-md border border-line2/80 bg-surface2/80 text-sm text-slate-100 outline-none transition-colors placeholder:text-dim focus:border-accent/70 focus:ring-2 focus:ring-accent/15";

/** Standard height input/select. */
export const fieldClass = `${fieldBase} h-9 px-3`;

/** Compact variant for in-row selects. */
export const fieldClassSm = `${fieldBase} h-8 px-2`;
