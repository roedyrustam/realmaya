# `realmaya`

AI-native headless browser automation library (Chrome & Firefox) with a **Token-Compressed Semantic Distiller** (including open Shadow DOM & `'full'` content mode), **Self-Healing Locator Cache** (JSON & SQLite), **Speculative Parallel Branching (`fork`)**, **Prompt-Injection Firewall & Destructive-Action Guards**, **Set-of-Mark Visual Grounding**, **Deterministic Network Mocking**, and a built-in **MCP v1.x Server** (with **MCP Sampling**).

## Key Capabilities
- **Dual-Engine Headless Control (`launch` & `connect`):** Zero-driver headless Chrome (CDP) and Firefox (native WebDriver BiDi), plus instant WebSocket attachment via `connect()`.
- **Token-Compressed Semantic Distiller:** Compresses 50k+ token DOMs (including open Shadow DOMs, `<select>` options, and `'full'` mode headings/text blocks) into ~400–1,500 token `<untrusted_dom>` semantic trees in < 30 ms.
- **Provider-Agnostic + MCP Sampling:** Use any OpenAI-compatible/BYOK `LlmProvider`, or let your MCP host (Antigravity, Claude, Gemini) supply intelligence via `sampling/createMessage` with zero API keys.
- **Self-Healing Locator Cache (JSON & `node:sqlite`):** Repeat `page.act()` calls resolve in < 5 ms with **0 LLM tokens**, automatically adapt to minor UI label changes, and fall back to structural CSS selectors if `[data-realmaya-id]` is wiped by a DOM re-render.
- **Speculative Parallel Branching (`page.fork()`):** Clone live session state (URL, cookies, `localStorage`, `sessionStorage`) into isolated contexts with `await using` (`Symbol.asyncDispose`) and TTL auto-reaping.
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
  llm,
  cachePath: './.realmaya/cache.db', // JSON or SQLite
  onDestructiveAction: async ({ instruction }) => !instruction.includes('delete account'),
});
const page = await browser.newPage();

await page.goto('https://example.com');
const distilled = await page.observe();
console.log(distilled.treeText);

// Speculative parallel branch
await using branch = await page.fork({ ttlMs: 30_000 });
await branch.act('click More information');

const data = await branch.extract(
  'Extract page heading and domain',
  z.object({ heading: z.string(), domain: z.string() }),
);

// Visual grounding screenshot with Set-of-Mark [id] badges
const annotatedPngBase64 = await page.screenshot({ setOfMark: true });
```

## Quick Start (MCP Server)

```bash
# stdio transport (for Antigravity / Claude / MCP clients)
npx realmaya mcp --chrome

# Firefox WebDriver BiDi over stdio
npx realmaya mcp --firefox

# Streamable HTTP transport
npx realmaya mcp --http --port 3333

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
```
