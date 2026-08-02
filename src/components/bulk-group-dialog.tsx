"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { BatchFeedback } from "@/lib/batch-feedback";
import { Button } from "./ui/button";
import { BatchResultBanner, failedBatchResult, type BatchResult } from "./ui/batch-result";
import { Dialog } from "./ui/dialog";
import { fieldClass } from "./ui/field";
import type { Group } from "./types";

type BulkGroupResult = {
  updated: number;
  feedback: BatchFeedback;
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
  const [result, setResult] = useState<BatchResult | null>(null);

  async function submit(): Promise<void> {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<BulkGroupResult>("/api/accounts/bulk-group", {
        ids,
        groupId: groupId || null,
      });
      setResult({ ...res.feedback, title: "批量修改分组完成", completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }) });
      onDone();
    } catch (e) {
      setResult(failedBatchResult("批量修改分组失败", ids.length, e));
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

      {result && <div className="mt-4"><BatchResultBanner result={result} onClose={() => setResult(null)} /></div>}
    </Dialog>
  );
}
