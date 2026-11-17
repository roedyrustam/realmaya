# `realmaya` — Subagent Contract Map (`CONTEXT_MAP.md`)

> Surgical interface & boundary slice for Swarm Fan-Out. Keep <300 tokens per subagent slice.

## Core Domain Contracts (`src/types.ts`)
- `LaunchOptions`: adds `onDestructiveAction?: DestructiveActionGuard`
- `ConnectOptions`: `{ wsUrl: string; engine?: BrowserEngine; llm?: LlmProvider; maxBranches?: number; cachePath?: string; timeoutMs?: number; onDestructiveAction?: DestructiveActionGuard }`
- `SemanticNode`: adds `options?: string[]`, `fallbackSelector?: string`
- `DistilledPage`: adds `contentBlocks?: string[]`
- `ActionResult`: `action: 'click' | 'type' | 'select' | 'press' | 'scroll' | 'noop'`, `blockedByGuard?: boolean`
- `Page`: adds `select()`, `press()`, `scroll()`, `waitForSelector()`, `screenshot(opts?: ScreenshotOptions)`, `getNetworkLog()`, `clearNetworkLog()`, `mockRoute()`

## Swarm Slice Ownership
- **Slice 1 & 2 (`fullstack-craftsman` — `src/semantic/`, `src/protocol/`, `src/browser/`, `src/index.ts`)**:
  - `src/semantic/firewall.ts`: Delimiter-breakout prevention (`<untrusted_dom>` / `</untrusted_dom>` stripping), `detectPromptInjectionPatterns(text)`, `isDestructiveIntent(instruction, node)`.
  - `src/semantic/distiller.ts`: Open Shadow DOM traversal, ancestor `opacity:0`/`visibility:hidden`/`font-size:0`/`clip-path` & negative off-screen coordinate trap filtering, `<select>` options extraction, `mode === 'full'` semantic `contentBlocks` (`h1..h6, p, li, th, td, pre, code, blockquote, article, [role="heading"], [role="alert"]`), `fallbackSelector` preservation, and `buildSetOfMarkExpression()` / `buildRemoveSetOfMarkExpression()`.
  - `src/semantic/locator-cache.ts`: JSON + optional SQLite (`node:sqlite` for `.db`/`.sqlite` paths) persistence + `fallbackSelector` storage.
  - `src/protocol/` & `src/browser/`: Process exit cleanup in `launcher.ts`, `RealmayaBrowser.connect()`, `page.select()`, `page.press()`, `page.scroll()`, `page.waitForSelector()`, `page.screenshot({ setOfMark })`, `page.getNetworkLog()`, `page.clearNetworkLog()`, `page.mockRoute()`, and fallbackSelector self-healing on `click(id)`/`type(id)`/`select(id)`/`press(id)`.
- **Slice 3 (`ai-mcp-engineer` — `src/ai/intent-engine.ts`, `src/mcp/server.ts`, `bin/realmaya.ts`)**:
  - `src/ai/intent-engine.ts`: Support `'click' | 'type' | 'select' | 'press' | 'scroll' | 'noop'`, enforce `onDestructiveAction` confirmation guard hook.
  - `src/mcp/server.ts`: Add `browser_extract`, `browser_select`, `browser_press`, `browser_scroll`, `browser_list_pages`, `browser_purge`, and `setOfMark` option on `browser_screenshot`.
