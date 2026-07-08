"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { fieldClass } from "./ui/field";
import type { Group } from "./types";

type BulkGroupResult = {
  updated: number;
};

export function BulkGroupDialog({
  ids,
  groups,
  onClose,
  onDone,
}: {
  ids: string[];
  groups: Group[];
  onClose: () => void;
  onDone: () => void;
}): React.ReactNode {
  const [groupId, setGroupId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.post<BulkGroupResult>("/api/accounts/bulk-group", {
        ids,
        groupId: groupId || null,
      });
      setMessage(`已更新 ${res.updated} 个账号的分组。`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "修改失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      title={`批量修改分组（已选 ${ids.length} 个账号）`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={submit} loading={loading}>
            应用分组
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">
        选择目标分组后会覆盖所选账号当前分组；选择「未分组」会把所选账号移出分组。
      </p>
      <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`w-full ${fieldClass}`}>
        <option value="">未分组</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      {message && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs text-slate-200">
          {message}
        </div>
      )}
    </Dialog>
  );
}
