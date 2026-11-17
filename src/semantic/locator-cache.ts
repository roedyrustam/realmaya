import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SemanticNode } from '../types.js';

export interface CachedLocatorEntry {
  origin: string;
  intentHash: string;
  fingerprint: string;
  role: string;
  name: string;
  fallbackSelector?: string;
  hitCount: number;
  lastVerifiedAt: number;
}

interface SqliteStatement {
  all(...params: unknown[]): Array<Record<string, unknown>>;
  run(...params: unknown[]): unknown;
}

interface SqliteDatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const LOCATOR_CACHE_DDL = `
CREATE TABLE IF NOT EXISTS locator_cache (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  fingerprint_json TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locator_origin_intent
  ON locator_cache (origin, intent_hash);
`;

/**
 * Self-healing semantic locator cache. Stores verified semantic fingerprints
 * keyed by `(origin, normalizedIntent)` and resolves matching or closely
 * similar elements without spending LLM tokens. Supports both JSON and SQLite
 * (`.db` / `.sqlite`) persistence.
 */
export class LocatorCache {
  private readonly entries = new Map<string, CachedLocatorEntry>();
  private readonly persistPath: string | undefined;
  private loaded = false;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
  }

  private static makeKey(origin: string, intent: string): string {
    const normalized = intent.trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = createHash('sha256').update(`${origin}::${normalized}`).digest('hex').slice(0, 16);
    return `${origin}::${hash}`;
  }

  private isSqlitePath(): boolean {
    return Boolean(this.persistPath && /\.(db|sqlite|sqlite3)$/i.test(this.persistPath));
  }

  private async openSqliteDb(): Promise<SqliteDatabaseSync | null> {
    if (!this.persistPath || !this.isSqlitePath()) return null;
    try {
      await mkdir(dirname(this.persistPath), { recursive: true });
      const modName = 'node:sqlite';
      const sqliteMod = (await import(modName)) as {
        DatabaseSync?: new (path: string) => SqliteDatabaseSync;
      };
      if (!sqliteMod.DatabaseSync) return null;
      const db = new sqliteMod.DatabaseSync(this.persistPath);
      db.exec(LOCATOR_CACHE_DDL);
      return db;
    } catch {
      return null;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded || !this.persistPath) {
      this.loaded = true;
      return;
    }
    this.loaded = true;
    if (!existsSync(this.persistPath)) return;

    if (this.isSqlitePath()) {
      const db = await this.openSqliteDb();
      if (db) {
        try {
          const rows = db
            .prepare(
              'SELECT id, origin, intent_hash, fingerprint_json, hit_count, last_verified_at FROM locator_cache',
            )
            .all();
          for (const row of rows) {
            const id = String(row.id ?? '');
            if (!id) continue;
            const parsedFp = JSON.parse(String(row.fingerprint_json ?? '{}')) as {
              fingerprint?: string;
              role?: string;
              name?: string;
              fallbackSelector?: string;
            };
            this.entries.set(id, {
              origin: String(row.origin ?? ''),
              intentHash: String(row.intent_hash ?? ''),
              fingerprint: String(parsedFp.fingerprint ?? ''),
              role: String(parsedFp.role ?? ''),
              name: String(parsedFp.name ?? ''),
              ...(parsedFp.fallbackSelector ? { fallbackSelector: parsedFp.fallbackSelector } : {}),
              hitCount: Number(row.hit_count ?? 1),
              lastVerifiedAt: Number(row.last_verified_at ?? Date.now()),
            });
          }
          return;
        } catch {
          // Fall through to JSON fallback if file was saved as JSON
        } finally {
          try {
            db.close();
          } catch {
            // Ignore close errors
          }
        }
      }
    }

    try {
      const raw = await readFile(this.persistPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, CachedLocatorEntry>;
      for (const [k, v] of Object.entries(parsed)) {
        this.entries.set(k, v);
      }
    } catch {
      // Corrupted cache file is ignored rather than crashing automation
    }
  }

  private async flush(): Promise<void> {
    if (!this.persistPath) return;
    await mkdir(dirname(this.persistPath), { recursive: true });

    if (this.isSqlitePath()) {
      const db = await this.openSqliteDb();
      if (db) {
        try {
          const stmt = db.prepare(`
            INSERT INTO locator_cache (id, origin, intent_hash, fingerprint_json, hit_count, last_verified_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              fingerprint_json = excluded.fingerprint_json,
              hit_count = excluded.hit_count,
              last_verified_at = excluded.last_verified_at
          `);
          const now = Date.now();
          for (const [id, entry] of this.entries.entries()) {
            const fpJson = JSON.stringify({
              fingerprint: entry.fingerprint,
              role: entry.role,
              name: entry.name,
              ...(entry.fallbackSelector ? { fallbackSelector: entry.fallbackSelector } : {}),
            });
            stmt.run(
              id,
              entry.origin,
              entry.intentHash,
              fpJson,
              entry.hitCount,
              entry.lastVerifiedAt,
              now,
            );
          }
          return;
        } finally {
          try {
            db.close();
          } catch {
            // Ignore close errors
          }
        }
      }
    }

    const obj = Object.fromEntries(this.entries.entries());
    await writeFile(this.persistPath, JSON.stringify(obj, null, 2), 'utf8');
  }

  /** Attempts to match a previously verified element against the current page snapshot. */
  async resolve(
    origin: string,
    intent: string,
    nodes: SemanticNode[],
  ): Promise<SemanticNode | null> {
    await this.ensureLoaded();
    const key = LocatorCache.makeKey(origin, intent);
    const entry = this.entries.get(key);
    if (!entry) return null;

    // 1. Exact semantic fingerprint match
    const exact = nodes.find((n) => n.fingerprint === entry.fingerprint && !n.disabled);
    if (exact) {
      entry.hitCount += 1;
      entry.lastVerifiedAt = Date.now();
      if (exact.fallbackSelector) {
        entry.fallbackSelector = exact.fallbackSelector;
      }
      await this.flush();
      return exact;
    }

    // 2. Self-healing fuzzy match: same ARIA role + high name token overlap
    const entryTokens = new Set(entry.name.toLowerCase().split(/\s+/).filter(Boolean));
    if (entryTokens.size === 0) return null;

    let bestNode: SemanticNode | null = null;
    let bestScore = 0;

    for (const node of nodes) {
      if (node.disabled || node.role !== entry.role) continue;
      const nodeTokens = new Set(node.name.toLowerCase().split(/\s+/).filter(Boolean));
      let overlap = 0;
      for (const tok of entryTokens) {
        if (nodeTokens.has(tok)) overlap += 1;
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
      if (bestNode.fallbackSelector) {
        entry.fallbackSelector = bestNode.fallbackSelector;
      }
      entry.hitCount += 1;
      entry.lastVerifiedAt = Date.now();
      await this.flush();
    }

    return bestNode;
  }

  /** Stores or updates a verified semantic fingerprint for future zero-token hits. */
  async record(origin: string, intent: string, node: SemanticNode): Promise<void> {
    await this.ensureLoaded();
    const key = LocatorCache.makeKey(origin, intent);
    this.entries.set(key, {
      origin,
      intentHash: key.split('::')[1] ?? '',
      fingerprint: node.fingerprint,
      role: node.role,
      name: node.name,
      ...(node.fallbackSelector ? { fallbackSelector: node.fallbackSelector } : {}),
      hitCount: 1,
      lastVerifiedAt: Date.now(),
    });
    await this.flush();
  }

  /** Clears all in-memory and persisted locator cache data. */
  async purge(): Promise<void> {
    this.entries.clear();
    if (this.persistPath) {
      await rm(this.persistPath, { force: true }).catch(() => {});
      await rm(`${this.persistPath}-wal`, { force: true }).catch(() => {});
      await rm(`${this.persistPath}-shm`, { force: true }).catch(() => {});
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
