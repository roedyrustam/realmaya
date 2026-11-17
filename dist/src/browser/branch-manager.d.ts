import type { Page } from '../types.js';
/**
 * Manages speculative parallel browser branches created via `page.fork()`,
 * enforcing the `maxBranches` pool cap and automatic TTL reaping.
 */
export declare class BranchManager {
    private readonly maxBranches;
    private readonly active;
    constructor(maxBranches?: number);
    register(page: Page, ttlMs?: number): void;
    unregister(pageId: string): void;
    reap(pageId: string): Promise<void>;
    closeAll(): Promise<void>;
    get count(): number;
}
//# sourceMappingURL=branch-manager.d.ts.map