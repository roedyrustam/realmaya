# Entity-Relationship & State Architecture (`ERD.md`)
**Project**: `realmaya`
**Version**: 1.0.0
**Last Updated**: 2026-11-18

---

## 1. Domain Entity-Relationship Diagram

```mermaid
erDiagram
    BROWSER ||--o{ BROWSER_CONTEXT : "isolates"
    BROWSER ||--|| LOCATOR_CACHE : "persists"
    BROWSER ||--|| BRANCH_MANAGER : "governs"
    BROWSER ||--|| INTENT_ENGINE : "orchestrates"
    BROWSER_CONTEXT ||--o{ PAGE : "hosts"
    PAGE ||--o{ PAGE : "forks (speculative branch)"
    PAGE ||--o{ DISTILLED_PAGE : "produces via observe()"
    DISTILLED_PAGE ||--o{ SEMANTIC_NODE : "contains"
    PAGE ||--o{ NETWORK_EXCHANGE : "records"
    MCP_SESSION ||--o| BROWSER : "manages"
    MCP_SESSION ||--o{ PAGE : "tracks active & forked"

    LOCATOR_CACHE {
        string id PK "origin::intent_hash"
        string origin "e.g. https://app.example.com"
        string intent_hash "SHA-256 (16-hex prefix)"
        string fingerprint "role|tag|name|placeholder"
        string role "ARIA / HTML role"
        string name "Accessible name"
        string fallback_selector "Structural CSS path"
        int hit_count "Zero-token cache hits"
        int last_verified_at "Unix epoch ms"
        int created_at "Unix epoch ms"
    }

    SEMANTIC_NODE {
        int id PK "Ephemeral [1..N]"
        string role "button | textbox | link | combobox | ..."
        string name "Sanitized accessible label"
        string tag "Lowercase HTML tag"
        string fingerprint "Deterministic semantic key"
        string selector "[data-realmaya-id='N']"
        string fallback_selector "Structural CSS fallback"
        json bbox "{ x, y, w, h }"
    }

    NETWORK_EXCHANGE {
        string url "Request URL"
        string method "GET | POST | ..."
        int status "HTTP status code"
        string mime_type "Response content-type"
        int timestamp "Epoch ms"
    }
```

---

## 2. Local SQLite & JSON Persistence Schema (`LocatorCache`)

`realmaya` supports zero-dependency persistence in both JSON (`~/.realmaya/locator-cache.json`) and native SQLite (`~/.realmaya/cache.db` via Node.js `node:sqlite`):

```sql
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
```

---

## 3. Speculative Branching (`page.fork()`) State Machine

```mermaid
stateDiagram-v2
    [*] --> ActiveParentPage: browser.newPage()
    ActiveParentPage --> SnapshotCaptured: page.fork({ ttlMs })
    SnapshotCaptured --> IsolatedContextCreated: createUserContext / createBrowserContext
    IsolatedContextCreated --> StateHydrated: Clone Cookies + Navigate URL + Hydrate Storage
    StateHydrated --> BranchActive: Register in BranchManager (TTL timer armed)
    BranchActive --> DisposedCleanly: await using scope exit / branch.close()
    BranchActive --> AutoReaped: TTL timer expired
    DisposedCleanly --> [*]
    AutoReaped --> [*]
```
