import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
/**
 * Self-healing semantic locator cache. Stores verified semantic fingerprints
 * keyed by `(origin, normalizedIntent)` and resolves matching or closely
 * similar elements without spending LLM tokens.
 */
export class LocatorCache {
    entries = new Map();
    persistPath;
    loaded = false;
    constructor(persistPath) {
        this.persistPath = persistPath;
    }
    static makeKey(origin, intent) {
        const normalized = intent.trim().toLowerCase().replace(/\s+/g, ' ');
        const hash = createHash('sha256').update(`${origin}::${normalized}`).digest('hex').slice(0, 16);
        return `${origin}::${hash}`;
    }
    async ensureLoaded() {
        if (this.loaded || !this.persistPath) {
            this.loaded = true;
            return;
        }
        this.loaded = true;
        if (!existsSync(this.persistPath))
            return;
        try {
            const raw = await readFile(this.persistPath, 'utf8');
            const parsed = JSON.parse(raw);
            for (const [k, v] of Object.entries(parsed)) {
                this.entries.set(k, v);
            }
        }
        catch {
            // Corrupted cache file is ignored rather than crashing automation
        }
    }
    async flush() {
        if (!this.persistPath)
            return;
        await mkdir(dirname(this.persistPath), { recursive: true });
        const obj = Object.fromEntries(this.entries.entries());
        await writeFile(this.persistPath, JSON.stringify(obj, null, 2), 'utf8');
    }
    /** Attempts to match a previously verified element against the current page snapshot. */
    async resolve(origin, intent, nodes) {
        await this.ensureLoaded();
        const key = LocatorCache.makeKey(origin, intent);
        const entry = this.entries.get(key);
        if (!entry)
            return null;
        // 1. Exact semantic fingerprint match
        const exact = nodes.find((n) => n.fingerprint === entry.fingerprint && !n.disabled);
        if (exact) {
            entry.hitCount += 1;
            entry.lastVerifiedAt = Date.now();
            await this.flush();
            return exact;
        }
        // 2. Self-healing fuzzy match: same ARIA role + high name token overlap
        const entryTokens = new Set(entry.name.toLowerCase().split(/\s+/).filter(Boolean));
        if (entryTokens.size === 0)
            return null;
        let bestNode = null;
        let bestScore = 0;
        for (const node of nodes) {
            if (node.disabled || node.role !== entry.role)
                continue;
            const nodeTokens = new Set(node.name.toLowerCase().split(/\s+/).filter(Boolean));
            let overlap = 0;
            for (const tok of entryTokens) {
                if (nodeTokens.has(tok))
                    overlap += 1;
            }
            const jaccard = overlap / Math.max(1, new Set([...entryTokens, ...nodeTokens]).size);
            if (jaccard >= 0.6 && jaccard > bestScore) {
                bestScore = jaccard;
                bestNode = node;
            }
        }
        if (bestNode) {
            entry.fingerprint = bestNode.fingerprint;
            entry.name = bestNode.name;
            entry.hitCount += 1;
            entry.lastVerifiedAt = Date.now();
            await this.flush();
        }
        return bestNode;
    }
    /** Stores or updates a verified semantic fingerprint for future zero-token hits. */
    async record(origin, intent, node) {
        await this.ensureLoaded();
        const key = LocatorCache.makeKey(origin, intent);
        this.entries.set(key, {
            origin,
            intentHash: key.split('::')[1] ?? '',
            fingerprint: node.fingerprint,
            role: node.role,
            name: node.name,
            hitCount: 1,
            lastVerifiedAt: Date.now(),
        });
        await this.flush();
    }
    /** Clears all in-memory and persisted locator cache data. */
    async purge() {
        this.entries.clear();
        if (this.persistPath && existsSync(this.persistPath)) {
            await rm(this.persistPath, { force: true });
        }
    }
    get size() {
        return this.entries.size;
    }
}
//# sourceMappingURL=locator-cache.js.map