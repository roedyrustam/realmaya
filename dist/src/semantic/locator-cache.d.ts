import type { SemanticNode } from '../types.js';
export interface CachedLocatorEntry {
    origin: string;
    intentHash: string;
    fingerprint: string;
    role: string;
    name: string;
    hitCount: number;
    lastVerifiedAt: number;
}
/**
 * Self-healing semantic locator cache. Stores verified semantic fingerprints
 * keyed by `(origin, normalizedIntent)` and resolves matching or closely
 * similar elements without spending LLM tokens.
 */
export declare class LocatorCache {
    private readonly entries;
    private readonly persistPath;
    private loaded;
    constructor(persistPath?: string);
    private static makeKey;
    private ensureLoaded;
    private flush;
    /** Attempts to match a previously verified element against the current page snapshot. */
    resolve(origin: string, intent: string, nodes: SemanticNode[]): Promise<SemanticNode | null>;
    /** Stores or updates a verified semantic fingerprint for future zero-token hits. */
    record(origin: string, intent: string, node: SemanticNode): Promise<void>;
    /** Clears all in-memory and persisted locator cache data. */
    purge(): Promise<void>;
    get size(): number;
}
//# sourceMappingURL=locator-cache.d.ts.map