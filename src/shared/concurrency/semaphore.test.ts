import { describe, expect, it } from "vitest";
import { Semaphore } from "./semaphore";

describe("Semaphore", () => {
  it("never exceeds configured provider concurrency", async () => {
    const gate = new Semaphore(2);
    let active = 0;
    let maximum = 0;
    await Promise.all(Array.from({ length: 8 }, (_, index) => gate.run(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return index;
    })));
    expect(maximum).toBe(2);
  });
});
