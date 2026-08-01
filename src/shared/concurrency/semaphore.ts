export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Semaphore capacity must be positive");
  }

  async run<T>(action: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await action(); }
    finally { this.release(); }
  }

  private acquire(): Promise<void> {
    if (this.active < this.capacity) { this.active += 1; return Promise.resolve(); }
    return new Promise((resolve) => this.waiting.push(() => { this.active += 1; resolve(); }));
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
