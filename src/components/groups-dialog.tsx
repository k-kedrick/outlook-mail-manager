"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { fieldClass } from "./ui/field";
import type { Group } from "./types";

// Cohesive palette — evenly spaced hues at a consistent 500-level tone.
export const GROUP_COLORS = [
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#22c55e", // green
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#a855f7", // purple
  "#64748b", // slate
];

export function GroupsDialog({
  groups,
  onClose,
  onChanged,
}: {
  groups: Group[];
  onClose: () => void;
  onChanged: () => void;
}): React.ReactNode {
  const [name, setName] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/groups", { name: name.trim(), color });
      setName("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    try {
      await api.del(`/api/groups/${id}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="分组管理" onClose={onClose}>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新分组名称"
          onKeyDown={(e) => e.key === "Enter" && create()}
          className={`flex-1 ${fieldClass}`}
        />
        <Button variant="primary" icon={<Plus size={16} />} onClick={create} loading={busy} disabled={!name.trim()}>
          添加
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-dim">颜色</span>
        {GROUP_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{ background: c }}
            className={`h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-surface transition ${
              color === c ? "ring-accent" : "ring-transparent hover:ring-line2"
            }`}
            aria-label={`颜色 ${c}`}
          />
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <ul className="mt-5 space-y-1.5">
        {groups.length === 0 && <li className="text-sm text-dim">还没有分组。</li>}
        {groups.map((g) => {
          const c = g.color ?? "#64748b";
          return (
            <li
              key={g.id}
              className="flex items-center justify-between rounded-lg border border-line bg-surface2/50 px-3 py-2"
            >
              <span
                className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-medium"
                style={{ background: `${c}1f`, color: c }}
              >
                <i className="h-2 w-2 rounded-full" style={{ background: c }} />
                {g.name}
                <span className="text-xs opacity-70">({g.accountCount})</span>
              </span>
              <button
                onClick={() => remove(g.id)}
                disabled={busy}
                className="text-dim transition-colors hover:text-rose-400"
              >
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
