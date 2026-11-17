import type { Page } from '../types.js';

interface TrackedBranch {
  page: Page;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Manages speculative parallel browser branches created via `page.fork()`,
 * enforcing the `maxBranches` pool cap and automatic TTL reaping.
 */
export class BranchManager {
  private readonly maxBranches: number;
  private readonly active = new Map<string, TrackedBranch>();

  constructor(maxBranches = 10) {
    this.maxBranches = maxBranches;
  }

  register(page: Page, ttlMs = 60_000): void {
    if (this.active.size >= this.maxBranches) {
      throw new Error(
        `Speculative branch limit reached (${this.maxBranches}). Dispose or close existing branches first.`,
      );
    }

    const timer = setTimeout(() => {
      void this.reap(page.id);
    }, ttlMs);
    timer.unref?.();

    this.active.set(page.id, { page, timer });
  }

  unregister(pageId: string): void {
    const entry = this.active.get(pageId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.active.delete(pageId);
  }

  async reap(pageId: string): Promise<void> {
    const entry = this.active.get(pageId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.active.delete(pageId);
    await entry.page.close().catch(() => {});
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.active.keys());
    await Promise.all(ids.map((id) => this.reap(id)));
  }

  get count(): number {
    return this.active.size;
  }
}
