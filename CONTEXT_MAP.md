# `realmaya` — Subagent Contract Map (`CONTEXT_MAP.md`)

> Surgical interface & boundary slice for Swarm Fan-Out. Keep <300 tokens per subagent slice.

## Core Domain Contracts (`src/types.ts`)
```ts
export type BrowserEngine = 'chrome' | 'firefox';

export interface LaunchOptions {
  engine?: BrowserEngine; // default: 'chrome'
  headless?: boolean;     // default: true
  executablePath?: string;
  args?: string[];
  llm?: LlmProvider;
  maxBranches?: number;   // default: 10
}

export interface SemanticNode {
  id: number;             // ephemeral interactive ID [1..N]
  role: string;
  name: string;
  tag: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  bbox: { x: number; y: number; w: number; h: number };
}

export interface DistilledPage {
  url: string;
  title: string;
  tokenEstimate: number;
  treeText: string;       // <untrusted_dom> wrapped compact representation
  nodes: SemanticNode[];
}

export interface LlmProvider {
  readonly name: string;
  completeJson<T>(params: {
    system: string;
    prompt: string;
    schema: unknown;      // Zod schema
  }): Promise<T>;
}

export interface Page extends AsyncDisposable {
  goto(url: string, opts?: { waitUntil?: 'load' | 'domcontentloaded' }): Promise<void>;
  observe(opts?: { mode?: 'interactive' | 'viewport' | 'full'; maxTokens?: number }): Promise<DistilledPage>;
  act(instruction: string): Promise<{ ok: boolean; nodeId?: number; cached: boolean }>;
  extract<T>(instruction: string, schema: unknown): Promise<T>;
  fork(opts?: { ttlMs?: number }): Promise<Page>;
  close(): Promise<void>;
}
```

## Swarm Slice Ownership
- **Slice 1 (`src/protocol/`, `src/browser/`):** BiDi WebSocket client, Chrome/Firefox launcher, `Browser`, `Page`, `fork()` reaper.
- **Slice 2 (`src/semantic/`):** In-page distiller script, prompt-injection firewall, `LocatorCache`.
- **Slice 3 (`src/ai/`, `src/mcp/`, `bin/`):** `LlmProvider`, `McpSamplingProvider`, `IntentEngine`, MCP v1.x server (`stdio` + `Streamable HTTP`), CLI.
- **Slice 4 (`tests/`):** Vitest unit/contract tests, Chrome & Firefox headless integration tests, security/firewall red-team tests.
