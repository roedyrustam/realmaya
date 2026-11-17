# `realmaya`

AI-native headless browser automation library (Chrome & Firefox) with a **Token-Compressed Semantic Distiller** (including Open Shadow DOM, same-origin `<iframe>`, & `'full'` content mode), **Self-Healing Locator Cache** (JSON & SQLite), **Speculative Parallel Branching (`fork`)**, **Multi-Step Autonomous Agent Loop (`runAgent`)**, **Warm Browser Pool Daemon (`realmaya daemon`)**, **Hardware-Level Trusted Input (`isTrusted: true`)**, **Prompt-Injection Firewall & Destructive-Action Guards**, **Set-of-Mark Visual Grounding**, **Deterministic Network Mocking**, and a built-in **MCP v1.x Server** (with **MCP Sampling**).

## Key Capabilities
- **Dual-Engine Headless Control (`launch`, `connect`, & `daemon`):** Zero-driver headless Chrome (CDP) and Firefox (native WebDriver BiDi), instant WebSocket attachment (`connect()`), and `< 20 ms` warm pool reuse (`realmaya daemon start` + `launch({ reuseDaemon: true })`).
- **Token-Compressed Semantic Distiller (`< 30 ms`):** Compresses 50k+ token DOMs (piercing open Shadow DOMs, same-origin `<iframe>`s, `<select>` options, and `'full'` mode headings/text blocks) into ~400–1,500 token `<untrusted_dom>` semantic trees.
- **Provider-Agnostic + MCP Sampling:** Use any OpenAI-compatible/BYOK `LlmProvider`, or let your MCP host (Antigravity, Claude, Gemini, Cursor) supply intelligence via `sampling/createMessage` with zero API keys.
- **Multi-Step Autonomous Agent (`page.runAgent()`):** Execute end-to-end goals via an autonomous *Observe -> Plan -> Act -> Stabilize* loop with step callbacks and guardrails.
- **Self-Healing Locator Cache (JSON & `node:sqlite`):** Repeat `page.act()` calls resolve in < 5 ms with **0 LLM tokens**, automatically adapt to minor UI label changes, and fall back to structural CSS selectors if `[data-realmaya-id]` is wiped by a DOM re-render.
- **Hardware-Level Trusted Input & Auto-Stability:** Dispatch native CDP/BiDi mouse & keyboard events (`{ trusted: true }` -> `event.isTrusted === true`) and await DOM/network quiescence (`waitForStable()`, `waitForNetworkIdle()`).
- **Speculative Parallel Branching (`page.fork()`) & Storage Persistence:** Clone live session state (URL, cookies, `localStorage`, `sessionStorage`) into isolated contexts with `await using` (`Symbol.asyncDispose`), or persist/restore auth state on disk (`saveStorageState()`, `loadStorageState()`).
- **Prompt-Injection Firewall & Destructive-Action Guard:** Strips `display:none`, ancestor `opacity:0`, `font-size:0`, off-screen coordinate traps, `</untrusted_dom>` delimiter breakouts, and prompt-injection payloads before LLM consumption, plus enforces `onDestructiveAction` confirmation hooks.
- **Visual Grounding (Set-of-Mark) & Network Mocking:** Render numbered `[id]` badges onto screenshots (`page.screenshot({ setOfMark: true })`) and mock fetch/XHR routes deterministically (`page.mockRoute()`).

## Quick Start (SDK)

```ts
import { launch, createOpenAiCompatibleProvider } from 'realmaya';
import { z } from 'zod';

const llm = createOpenAiCompatibleProvider({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

await using browser = await launch({
  engine: 'chrome',
  headless: true,
  reuseDaemon: true, // attaches in <20ms if `realmaya daemon start` is running
  llm,
  cachePath: './.realmaya/cache.db', // JSON or SQLite
  onDestructiveAction: async ({ instruction }) => !instruction.includes('delete account'),
});
const page = await browser.newPage();

await page.goto('https://example.com');
await page.waitForStable();

// Speculative parallel branch
await using branch = await page.fork({ ttlMs: 30_000 });
await branch.act('click More information');

// Multi-step autonomous goal execution
const agentResult = await branch.runAgent('Find the domain specification link and summarize it', {
  maxSteps: 5,
});

// Structured extraction with Zod
const data = await branch.extract(
  'Extract page heading and domain',
  z.object({ heading: z.string(), domain: z.string() }),
);

// Persist session state (cookies + localStorage + sessionStorage)
await page.saveStorageState('./.realmaya/auth-state.json');
```

## Quick Start (MCP Server & Warm Daemon)

### 1. MCP Client Configuration (Antigravity / Claude Desktop / Cursor)
Add `realmaya` to your `mcpServers` configuration (zero API keys needed when your host supports MCP Sampling):

```json
{
  "mcpServers": {
    "realmaya": {
      "command": "npx",
      "args": ["-y", "realmaya", "mcp", "--chrome"]
    }
  }
}
```

### 2. CLI Commands

```bash
# stdio transport (for Antigravity / Claude / Cursor)
npx realmaya mcp --chrome
npx realmaya mcp --firefox

# Streamable HTTP transport
npx realmaya mcp --http --port 3333

# Persistent warm browser daemon (<20ms attach latency)
npx realmaya daemon start --chrome
npx realmaya daemon status
npx realmaya daemon stop

# Wipe local self-healing locator cache
npx realmaya purge
```

## Documentation
- [Product Requirements Document (`PRD.md`)](file:///c:/realmaya/PRD.md)
- [Architecture & Design (`DESIGN.md`)](file:///c:/realmaya/DESIGN.md)
- [Entity-Relationship & State Diagrams (`ERD.md`)](file:///c:/realmaya/ERD.md)
- [Full SDK & MCP Reference (`DOCUMENTATION.md`)](file:///c:/realmaya/DOCUMENTATION.md)

## Development

```bash
bun install
npm run typecheck
npm run build
npm test
npm run lint
```
