# `realmaya` — Design & Skill Orchestration Document

## 1. Understanding Summary
- **Core Goal:** Build a TypeScript-first headless browser automation library and native MCP v1.x server (`realmaya`) controlling Chrome and Firefox via WebDriver BiDi, purpose-built for the Super-Intelligence era.
- **Audience:** AI Agent/Swarm engineers, data extraction engineers, and TypeScript/JS developers seeking a faster, AI-native successor to Puppeteer.
- **Key Pillars:**
  1. Unified WebDriver BiDi transport (Chrome & Firefox) + optional CDP bridge.
  2. In-page Token-Compressed Semantic Distiller (>= 85% token reduction, < 30 ms).
  3. Provider-Agnostic Intent Engine + MCP Sampling + Self-Healing Locator Cache.
  4. Speculative Parallel Branching (`page.fork()`) with `Symbol.asyncDispose` & TTL auto-reaper.
  5. Prompt-Injection Firewall sanitizing untrusted DOM content.
- **Non-Goals (v1.0):** Custom browser engine, GUI desktop builder, cloud SaaS hosting.

## 2. Technical Architecture & Skill Delegation
| Layer / Module | Responsibility | Delegated Skills |
| :--- | :--- | :--- |
| **BiDi Transport & Browser Launcher** | Process spawning (Chrome/Firefox), WebSocket BiDi JSON-RPC, Contexts, Input, Network | `typescript-expert`, `js-backend-expert`, `bun-runtime-expert`, `browser-automation-expert` |
| **In-Page Semantic Distiller** | DOM traversal, visibility/hidden-trap filtering, numeric ID tagging, token-budget pruning | `typescript-expert`, `prompt-injection-firewall`, `kv-cache-prefix-optimizer` |
| **Intent & Self-Healing Engine** | `act()`, `extract()`, `observe()`, fingerprint hashing, SQLite/memory cache, BYOK `LlmProvider` | `ai-llm-integration-expert`, `structured-output-contracts`, `database-orm-expert` |
| **Speculative Branching** | `fork()` state cloning (cookies, storage, URL), TTL reaper, resource disposal | `error-resilience-expert`, `scalability-clean-code` |
| **MCP v1.x Server & CLI** | `stdio` & `Streamable HTTP` transports, Zod tool contracts, `sampling/createMessage` | `mcp-server-architect`, `api-design-expert` |
| **Verification & Hardening** | Unit tests, Chrome/Firefox BiDi contract tests, red-team prompt-injection tests, anti-slop | `autonomous-tdd-debugger`, `e2e-testing-expert`, `autonomous-red-teamer`, `anti-slop` |

## 3. Package & Module Architecture
Single-repo TypeScript workspace (`package.json` with clean subpath exports, zero speculative microservice split):
```text
c:\realmaya/
├── src/
│   ├── index.ts                 # Public SDK entry (launch, connect, types)
│   ├── protocol/
│   │   ├── bidi-client.ts       # WebDriver BiDi WebSocket & JSON-RPC multiplexer
│   │   ├── launcher.ts          # Headless Chrome & Firefox binary discovery & spawn
│   │   └── cdp-bridge.ts        # Optional Chromium CDP passthrough
│   ├── browser/
│   │   ├── browser.ts           # Browser & BrowserContext lifecycle
│   │   ├── page.ts              # High-level Page API (goto, click, type, act, extract, observe, fork)
│   │   └── branch-manager.ts    # Speculative fork() state cloner & TTL auto-reaper
│   ├── semantic/
│   │   ├── distiller.ts         # In-page script injector & token-compressed tree builder
│   │   ├── firewall.ts          # Prompt-injection sanitizer & hidden-node filter
│   │   └── locator-cache.ts     # Self-healing semantic fingerprint cache (Memory / SQLite)
│   ├── ai/
│   │   ├── provider.ts          # Provider-agnostic LlmProvider interface & adapters
│   │   ├── mcp-sampling.ts      # MCP sampling/createMessage bridge
│   │   └── intent-engine.ts     # act() / extract() orchestration with Zod schemas
│   └── mcp/
│       ├── server.ts            # MCP v1.x server (stdio & Streamable HTTP)
│       └── tools.ts             # Zod-validated MCP tool definitions
├── bin/
│   └── realmaya.ts              # CLI (`realmaya mcp`, `realmaya purge`)
├── tests/
│   ├── unit/                    # Distiller, firewall, cache, BiDi framing tests
│   └── integration/             # Live Chrome & Firefox headless contract tests
├── PRD.md
├── DESIGN.md
└── CONTEXT_MAP.md
```

## 4. Architectural Decision Records (MADR Standard)
| # | Decision Title | Status | Context & Problem | Chosen Solution & Rationale | Consequences & Trade-offs | Orchestrated Skill |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Direct WebDriver BiDi Core | Accepted | Wrapping Puppeteer/Playwright inherits heavy bundles and limits low-level control. | Implement pure-TS WebDriver BiDi client for Chrome & Firefox + optional CDP bridge. | Full control & <150KB bundle; requires maintaining BiDi capability adapters. | `browser-automation-expert`, `typescript-expert` |
| 2 | In-Page Semantic Distiller | Accepted | Raw DOM (35k–80k tokens) wastes LLM budget and degrades reasoning accuracy. | Inject <15KB script returning pruned, numeric-ID semantic tree + bounding boxes. | Cuts tokens >= 85% and latency < 30 ms; non-ARIA canvas UIs need Phase 2 visual mode. | `ai-llm-integration-expert`, `kv-cache-prefix-optimizer` |
| 3 | Dual LLM Mode (BYOK + MCP Sampling) | Accepted | Requiring API keys blocks zero-config MCP host usage; MCP-only blocks standalone scripts. | Define minimal `LlmProvider` interface + `McpSamplingProvider` adapter. | Works out-of-the-box in Antigravity/Claude/Gemini and standalone in Node/Bun. | `mcp-server-architect`, `structured-output-contracts` |
| 4 | Disposable Speculative `fork()` | Accepted | Parallel agent exploration risks context leaks and orphaned RAM usage. | Implement `Symbol.asyncDispose` + TTL auto-reaper on cloned `BrowserContext`. | Safe parallel branching (<50 ms) with deterministic cleanup. | `error-resilience-expert`, `typescript-expert` |
| 5 | Prompt-Injection Firewall | Accepted | Malicious web pages can embed hidden text to hijack MCP agents. | Filter invisible/zero-opacity nodes in-page and wrap DOM in `<untrusted_dom>` delimiters. | Blocks common indirect injection vectors; adds <2 ms distiller overhead. | `prompt-injection-firewall`, `autonomous-red-teamer` |

## 5. Pre-Mortem Risk Assessment & Mitigation
1. **Indirect Prompt Injection:** Mitigated by in-page visibility/computed-style filtering + `<untrusted_dom>` boundary isolation + destructive-action guard hooks.
2. **Chrome vs Firefox BiDi Divergence:** Mitigated by a strict `BiDiCapabilities` adapter layer and dual-engine integration tests.
3. **Token Explosion on Large SPAs:** Mitigated by configurable `DistillOptions` (`mode: 'interactive' | 'viewport' | 'full'`, `maxTokens` hard cap).
4. **Branch Memory Exhaustion:** Mitigated by `maxBranches` pool cap, per-branch TTL reaper, and `await using` disposal.

## 6. Subagent Contract Map Slice
See [CONTEXT_MAP.md](file:///c:/realmaya/CONTEXT_MAP.md) for the exact TypeScript interfaces, module boundaries, and target file paths used during Swarm Fan-Out.
