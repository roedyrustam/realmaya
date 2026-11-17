# `realmaya` — Subagent Contract Map (`CONTEXT_MAP.md`)

> Surgical interface & boundary slice for Swarm Fan-Out. Keep <300 tokens per subagent slice.

## Production Release Upgrade Slices
- **Slice A (`fullstack-craftsman` — `src/semantic/distiller.ts`, `src/protocol/`, `src/browser/`, `src/index.ts`)**:
  - `src/semantic/distiller.ts`: Traverse same-origin `HTMLIFrameElement.contentDocument` inside `collectAllElements()` (with `try/catch` for cross-origin safety) and accumulate iframe offset into `bbox`.
  - `src/protocol/driver-adapter.ts`: Add hardware-level trusted input methods `dispatchClick(handle, x, y)`, `dispatchKeys(handle, text)`, and `dispatchKeyPress(handle, key)` to `DriverAdapter`, `CdpDriverAdapter` (`Input.dispatchMouseEvent`, `Input.insertText`, `Input.dispatchKeyEvent`), and `BidiDriverAdapter` (`input.performActions`).
  - `src/protocol/daemon.ts`: Create warm browser daemon manager (`startDaemon`, `stopDaemon`, `getDaemonStatus`, `getDaemonFilePath`) storing `DaemonMetadata` at `~/.realmaya/daemon-<engine>.json`.
  - `src/browser/page.ts` & `src/browser/browser.ts` & `src/index.ts`:
    - `queryDeep` searches `document`, open `shadowRoot`, AND same-origin `iframe.contentDocument`.
    - Support `opts?.trusted` on `click`, `type`, `press` using `driver.dispatchClick` / `dispatchKeys` / `dispatchKeyPress`.
    - Implement `waitForNetworkIdle()`, `waitForStable()`, `saveStorageState()`, `loadStorageState()`, and `runAgent(goal, opts)` (delegating to `this.intentEngine.runAgent(this, goal, opts)`).
    - In `RealmayaBrowser.launch(opts)`: if `opts.reuseDaemon` is true, check `getDaemonStatus(engine)` and connect via `RealmayaBrowser.connect({ wsUrl: daemon.wsUrl, ...opts })` when alive.
- **Slice B (`ai-mcp-engineer` — `src/ai/intent-engine.ts`, `src/mcp/server.ts`, `bin/realmaya.ts`)**:
  - `src/ai/intent-engine.ts`: Implement `runAgent(page: Page, goal: string, opts?: AgentLoopOptions): Promise<AgentLoopResult>` (Observe -> Plan next instruction or complete/fail -> Act -> `waitForStable()`).
  - `src/mcp/server.ts`: Register `browser_agent` (multi-step autonomous agent loop), `browser_storage_save`, and `browser_storage_load` MCP tools.
  - `bin/realmaya.ts`: Add `realmaya daemon start|stop|status [--chrome|--firefox]` CLI commands.
- **Slice C (`quality-guardian` — `tests/`, `.github/workflows/`)**:
  - Expand unit & live Chrome integration tests (`iframe` distillation, `trusted` click/type/press, `waitForStable`, `waitForNetworkIdle`, `saveStorageState`/`loadStorageState`, `runAgent`, `daemon` metadata, MCP `browser_agent`).
  - Create `tests/integration/firefox-smoke.test.ts` and `.github/workflows/release.yml` + update `.github/workflows/ci.yml`.
