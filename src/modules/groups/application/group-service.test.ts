import { describe, expect, it, vi } from "vitest";
import { GroupNotFoundError } from "../domain/group";
import { GroupService } from "./group-service";

describe("GroupService", () => {
  it("delegates valid group operations", async () => {
    const group = { id: "group-1", name: "Primary", color: null, sortOrder: 0, createdAt: new Date() };
    const repository = {
      list: vi.fn(async () => [{ ...group, _count: { accounts: 2 } }]),
      create: vi.fn(async () => group),
      update: vi.fn(async () => group),
      delete: vi.fn(async () => true),
    };
    const service = new GroupService(repository);
    await expect(service.list()).resolves.toHaveLength(1);
    await expect(service.create({ name: "Primary" })).resolves.toBe(group);
    await expect(service.update("group-1", { color: "#112233" })).resolves.toBe(group);
    await expect(service.delete("group-1")).resolves.toBeUndefined();
  });

  it("normalizes missing update and delete outcomes", async () => {
    const service = new GroupService({ update: vi.fn(async () => null), delete: vi.fn(async () => false) } as any);
    await expect(service.update("missing", {})).rejects.toBeInstanceOf(GroupNotFoundError);
    await expect(service.delete("missing")).rejects.toBeInstanceOf(GroupNotFoundError);
  });
});
