/**
 * Manages speculative parallel browser branches created via `page.fork()`,
 * enforcing the `maxBranches` pool cap and automatic TTL reaping.
 */
export class BranchManager {
    maxBranches;
    active = new Map();
    constructor(maxBranches = 10) {
        this.maxBranches = maxBranches;
    }
    register(page, ttlMs = 60_000) {
        if (this.active.size >= this.maxBranches) {
            throw new Error(`Speculative branch limit reached (${this.maxBranches}). Dispose or close existing branches first.`);
        }
        const timer = setTimeout(() => {
            void this.reap(page.id);
        }, ttlMs);
        timer.unref?.();
        this.active.set(page.id, { page, timer });
    }
    unregister(pageId) {
        const entry = this.active.get(pageId);
        if (!entry)
            return;
        clearTimeout(entry.timer);
        this.active.delete(pageId);
    }
    async reap(pageId) {
        const entry = this.active.get(pageId);
        if (!entry)
            return;
        clearTimeout(entry.timer);
        this.active.delete(pageId);
        await entry.page.close().catch(() => { });
    }
    async closeAll() {
        const ids = Array.from(this.active.keys());
        await Promise.all(ids.map((id) => this.reap(id)));
    }
    get count() {
        return this.active.size;
    }
}
//# sourceMappingURL=branch-manager.js.map