# Product Requirements Document (PRD)
**Project**: `realmaya`
**Version**: 1.0.0
**Status**: Completed (v1.0.0 Production Ready)
**Created**: 2026-11-18
**Last Updated**: 2026-11-18

---

## 1. Executive Summary
`realmaya` is a TypeScript-first headless browser automation library and native Model Context Protocol (MCP v1.x) server for controlling Chrome and Firefox via WebDriver BiDi. It replaces brittle CSS/XPath-only automation with an in-page Token-Compressed Semantic Distiller, self-healing locators, speculative browser-context branching, and provider-agnostic AI intent execution with MCP Sampling support.

## 2. Problem Statement
**Problem**: Existing headless browser libraries (Puppeteer, Playwright) expose raw DOM/CDP primitives that require brittle selectors, consume 35k–80k LLM tokens per page when used by AI agents, lack native MCP server/sampling integration, and cannot cheaply fork live browser state for parallel agent exploration.
**Target Users**:
1. AI Agent & Swarm Engineers building autonomous web-operating agents.
2. Data & Scraping Engineers extracting structured data from dynamic SPAs.
3. TypeScript/JavaScript Developers seeking a drop-in, modern alternative to Puppeteer.
**Current Pain Points**:
- Selector breakage on minor frontend deployments.
- High LLM token latency and cost when passing raw HTML or full-page screenshots.
- Boilerplate glue code required to expose browser sessions as MCP tools.
- High memory and cold-start overhead when testing multiple parallel action paths.

## 3. Goals & Success Metrics
| Goal | Metric | Target |
| :--- | :--- | :--- |
| Token Efficiency | Semantic Tree tokens vs Raw HTML | >= 85% reduction (<= 1,500 tokens/page default) |
| Extraction Speed | In-page Semantic Distiller execution | p95 < 30 ms on standard DOM (<= 5,000 nodes) |
| Cold-Start & Forking | Browser launch / `context.fork()` latency | Launch < 500 ms; `fork()` < 50 ms |
| Cross-Browser Parity | Core BiDi API pass rate (Chrome & Firefox) | 100% on contract test suite |
| Zero-Token Repeat Actions | Self-healing locator cache hit latency | < 5 ms (0 LLM tokens) |

## 4. User Personas
### Persona 1: Autonomous Agent Builder
- **Role**: AI Systems / MCP Engineer
- **Goals**: Connect an LLM host (Antigravity, Claude, Gemini) to a live headless browser via MCP without managing separate API keys or brittle selectors.
- **Frustrations**: Raw DOM overflows context windows; prompt injections inside untrusted web pages; slow sequential trial-and-error.
- **Key Behaviors**: Runs `realmaya mcp` via `stdio` or `Streamable HTTP`, relies on MCP Sampling and `fork()` to test risky actions safely.

### Persona 2: Fullstack & Scraping Developer
- **Role**: Senior TypeScript / Node.js / Bun Engineer
- **Goals**: Write concise, type-safe scripts (`page.act()`, `page.extract(schema)`) that survive UI refactors across Chrome and Firefox.
- **Frustrations**: Heavy binary dependencies, flaky `waitForSelector` timeouts, maintaining separate Puppeteer/Playwright wrappers.
- **Key Behaviors**: Installs `realmaya` via npm/bun, plugs in a preferred LLM provider (or runs deterministic mode without LLM).

## 5. Feature Requirements
### MVP Features (Must Have — v1.0)
- [x] **Unified WebDriver BiDi Transport (`@realmaya/core`)**: Native WebDriver BiDi WebSocket client managing headless Chrome and Firefox processes, tabs, navigation, input dispatch, and optional CDP bridge for Chromium-specific features.
  - *Acceptance Criteria*: Launches Chrome and Firefox headless, navigates, clicks, types, intercepts network requests, and cleans up child processes on exit/SIGINT.
- [x] **In-Page Semantic Distiller**: Lightweight (<15 KB) injected script producing a deterministic, token-compressed interactive tree with numeric element IDs (`[12] button "Submit"`), ARIA roles, bounding boxes, and viewport pruning.
  - *Acceptance Criteria*: Compresses a 5,000-node DOM into <= 1,500 tokens in < 30 ms (p95) and maps numeric IDs back to live DOM element handles.
- [x] **Semantic Intent Engine & Self-Healing Locators**: High-level `page.act(instruction)`, `page.extract(zodSchema)`, and `page.observe()` APIs backed by a persistent/in-memory semantic fingerprint cache.
  - *Acceptance Criteria*: Resolves actions via cached semantic fingerprints in < 5 ms (0 LLM tokens) when DOM structure matches; falls back to LLM/MCP Sampling and updates cache when UI changes.
- [x] **Provider-Agnostic LLM Adapter + MCP Sampling**: Pluggable `LlmProvider` interface supporting BYOK (Gemini, OpenAI, Anthropic, local SLM/Ollama) and native MCP `sampling/createMessage` delegation.
  - *Acceptance Criteria*: Works with zero external API keys when connected to an MCP host supporting sampling, and works standalone with any custom `LlmProvider`.
- [x] **Speculative Parallel Branching (`page.fork()`)**: Clones active session state (URL, cookies, `localStorage`, `sessionStorage`) into isolated browser contexts with TTL auto-reaper and `Symbol.asyncDispose` (`await using`).
  - *Acceptance Criteria*: Forks a live page into N isolated contexts in < 50 ms per branch; automatically closes expired/disposed branches with zero zombie contexts.
- [x] **Native MCP v1.x Server (`realmaya mcp`)**: Exposes browser control, semantic observation, extraction, and branching as Zod-validated MCP tools over `stdio` and `Streamable HTTP`.
  - *Acceptance Criteria*: Passes MCP Inspector / client tool discovery and executes end-to-end multi-step navigation + extraction tasks.
- [x] **Prompt-Injection Firewall & Data Hygiene**: Wraps untrusted page text in boundary delimiters (`<untrusted_dom>`), strips hidden/zero-opacity instruction traps, and enforces explicit confirmation hooks for destructive actions.
  - *Acceptance Criteria*: Hidden `display:none` / `opacity:0` / off-screen prompt-injection payloads are excluded from the distilled semantic tree.
- [x] **Privacy, Telemetry & Local Data Deletion Controls**: Zero-telemetry-by-default invariant; explicit `session.clearAllData()` / `realmaya purge` API & CLI command to wipe local locator caches, cookies, and temporary profiles (compliant with local-first privacy & GDPR Art. 17 data-erasure principles).

### Phase 2 Features (Should Have — v1.x)
- [x] **Remote Browser Attachment (`realmaya.connect()`)**: Attach directly to warm or remote Chrome/Firefox WebSocket endpoints for instant session attachment.
- [x] **Visual Grounding (Set-of-Mark Overlay)**: Optional screenshot annotation mode (`page.screenshot({ setOfMark: true })`) for canvas/WebGL/non-ARIA UIs.
- [x] **Deterministic Network Record & Replay**: In-page route mocking (`page.mockRoute()`) and network exchange logging (`page.getNetworkLog()`) for zero-flakiness CI testing.

### Future Features (Nice to Have — v2.0+)
- [ ] **Distributed Swarm Grid**: Remote WebSocket multiplexing across multiple worker nodes.
- [ ] **Visual Time-Travel Debugger UI**: Companion web inspector for replaying `fork()` trees.

## 6. Technical Architecture
### Stack Decision
| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| Language & Runtime | TypeScript 5.8+ (ESM), Node.js 22+ & Bun 1.2+ | Native WebSocket, `Symbol.asyncDispose`, strict typing, zero native build toolchain |
| Browser Protocol | WebDriver BiDi (Primary) + CDP (Optional Bridge) | W3C cross-browser standard for Chrome & Firefox without Puppeteer/Playwright dependency |
| Schema & Validation | Zod v3/v4 | Runtime contract validation for `extract()`, BiDi payloads, and MCP tool schemas |
| MCP Integration | `@modelcontextprotocol/sdk` (v1.x) | Standard `stdio` and `Streamable HTTP` transport + `sampling/createMessage` |
| Local State / Cache | In-Memory + Optional SQLite (`node:sqlite` / `bun:sqlite`) | Zero-dependency persistent self-healing locator cache |
| Testing & Linting | Vitest 3+ & Biome v2 | Fast unit/contract tests and deterministic formatting/linting |

### Architecture Decisions (ADRs)
- **ADR-001**: Use WebDriver BiDi directly instead of wrapping Playwright/Puppeteer to maintain <100 KB core footprint and full control over context forking.
- **ADR-002**: Inject a pure-JS Semantic Distiller (<15 KB) into the page context rather than pulling full HTML over WebSocket, cutting IPC payload and LLM tokens by >= 85%.
- **ADR-003**: Support both BYOK `LlmProvider` and MCP Sampling so `realmaya` operates with zero API keys inside MCP hosts and standalone in Node/Bun scripts.

## 7. Data Model (Local Locator Cache & Session State)
```sql
-- Optional local SQLite schema for Self-Healing Locator Cache (~/.realmaya/cache.db)
CREATE TABLE IF NOT EXISTS locator_cache (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  fingerprint_json TEXT NOT NULL, -- role, accessibleName, tag, attributes, relativePath
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locator_origin_intent
  ON locator_cache (origin, intent_hash);
```

## 8. User Flows
### Primary Flow: AI Agent via MCP (`stdio` / `Streamable HTTP`)
1. Host (Antigravity/Claude/Gemini) starts `realmaya mcp` and discovers tools (`browser_navigate`, `browser_observe`, `browser_act`, `browser_extract`, `browser_fork`).
2. Host calls `browser_navigate({ url })` -> BiDi navigates headless Chrome/Firefox.
3. Host calls `browser_observe()` -> In-page Distiller returns sanitized, token-compressed semantic tree (`[1] input "Email"`, `[2] button "Sign In"`).
4. Host calls `browser_act({ instruction: "Fill email with user@example.com and click Sign In" })` -> `realmaya` resolves via cache or MCP Sampling, executes BiDi input events, and returns updated semantic diff.

### Secondary Flow: Developer SDK with Speculative Forking
1. Developer calls `const browser = await realmaya.launch({ engine: 'firefox', headless: true })`.
2. Developer navigates to a checkout/form flow and calls `await using branchA = await page.fork()`.
3. `branchA` and `page` execute divergent actions concurrently in isolated contexts; `branchA` auto-disposes on scope exit.

## 9. Non-Functional Requirements
| Requirement | Target |
| :--- | :--- |
| Core Bundle Size | < 150 KB minified (excluding optional LLM SDKs) |
| Semantic Distiller Latency | p95 < 30 ms (DOM <= 5,000 nodes) |
| Context Fork Latency | p95 < 50 ms |
| Memory Leak Tolerance | 0 orphaned browser processes or contexts after `close()` / TTL expiry |
| Security | 100% hidden/invisible DOM nodes stripped from LLM context; no arbitrary `eval` exposed via MCP |
| Code Quality | 100% TypeScript `strict: true`, 0 `any` in public APIs, passes Biome & Anti-Slop gates |

## 10. Out of Scope (v1.0)
- Building a custom browser rendering engine.
- GUI desktop recorder / visual workflow builder.
- Cloud-hosted multi-tenant SaaS dashboard.
