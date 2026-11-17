# `realmaya`

[![CI](https://github.com/roedyrustam/realmaya/actions/workflows/ci.yml/badge.svg)](https://github.com/roedyrustam/realmaya/actions/workflows/ci.yml)
[![TypeScript 5.8+](https://img.shields.io/badge/TypeScript-5.8%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP v1.x](https://img.shields.io/badge/MCP-v1.x%20Ready-0f172a)](https://modelcontextprotocol.io/)
[![WebDriver BiDi & CDP](https://img.shields.io/badge/Protocol-WebDriver%20BiDi%20%2B%20CDP-059669)](https://w3c.github.io/webdriver-bidi/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**`realmaya`** is an AI-native headless browser automation library and native **Model Context Protocol (MCP v1.x)** server for controlling **Chrome** (CDP) and **Firefox** (WebDriver BiDi) with zero heavy driver dependencies.

It replaces brittle CSS/XPath-only automation and 50,000-token raw HTML dumps with an in-page **Token-Compressed Semantic Distiller**, **Self-Healing Locator Cache**, **Speculative Parallel Branching (`page.fork()`)**, **Set-of-Mark Visual Grounding**, and a **Prompt-Injection Firewall**.

---

## Key Capabilities

| Capability | Description |
| :--- | :--- |
| **Dual-Engine Headless Control** | Zero-driver headless **Chrome** (CDP) and **Firefox** (native WebDriver BiDi) over a unified JSON-RPC WebSocket multiplexer. |
| **Token-Compressed Semantic Distiller** | Compresses 50k+ token DOMs (including open Shadow DOM) into `<= 1,500` token `<untrusted_dom>` semantic trees in `< 30 ms` (**>= 85% token reduction**). |
| **Self-Healing Locator Cache** | Repeat `page.act()` calls resolve in `< 5 ms` with **0 LLM tokens** (JSON or `node:sqlite` `.db` persistence) and self-heal via Jaccard token similarity + structural `fallbackSelector` recovery. |
| **Provider-Agnostic + MCP Sampling** | Bring your own OpenAI-compatible/BYOK `LlmProvider`, or let your MCP host (Antigravity, Claude, Gemini) supply intelligence via `sampling/createMessage` with **zero API keys**. |
| **Speculative Parallel Branching (`page.fork()`)** | Clone live session state (URL, cookies, `localStorage`, `sessionStorage`) into isolated browser contexts with `await using` (`Symbol.asyncDispose`) and TTL auto-reaping. |
| **Prompt-Injection Firewall & Safety Guard** | Strips `display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `clip-path:inset(100%)`, negative off-screen traps, `<untrusted_dom>` breakout tags, and prompt-injection override phrases; enforces `onDestructiveAction` confirmation hooks. |
| **Set-of-Mark Visual Grounding & Network Mocking** | Annotate interactive elements with `[id]` bounding-box overlays (`page.screenshot({ setOfMark: true })`) and mock `fetch`/`XMLHttpRequest` routes deterministically (`page.mockRoute()`). |

---

## Quick Start (TypeScript SDK)

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
  cachePath: '.realmaya/locators.db', // Supports .db/.sqlite (node:sqlite) or .json
  onDestructiveAction: async ({ instruction, action }) => {
    console.warn(`Confirm destructive ${action}: ${instruction}`);
    return false; // Block unapproved destructive actions
  },
});

const page = await browser.newPage();
await page.goto('https://example.com');

// 1. Observe token-compressed semantic tree (< 1,500 tokens)
const distilled = await page.observe({ mode: 'interactive' });
console.log(distilled.treeText);

// 2. Speculative parallel branch with automatic disposal
await using branch = await page.fork({ ttlMs: 30_000 });
await branch.act('Click More information');

// 3. Structured Zod schema extraction
const data = await branch.extract(
  'Extract page heading and domain',
  z.object({ heading: z.string(), domain: z.string() }),
);
console.log(data);
```

---

## Quick Start (MCP v1.x Server)

Run `realmaya` as a native MCP server over `stdio` or `Streamable HTTP`:

```bash
# stdio transport (for Antigravity / Claude Desktop / Cursor / MCP hosts)
npx realmaya mcp --chrome

# Firefox WebDriver BiDi over stdio
npx realmaya mcp --firefox

# Streamable HTTP transport (/mcp endpoint + /healthz)
npx realmaya mcp --http --port 3333

# Wipe local self-healing locator cache (GDPR Art. 17 / local data hygiene)
npx realmaya purge
```

### Exposed MCP Tools (12 Tools)

| MCP Tool | Description |
| :--- | :--- |
| `browser_navigate` | Navigate the active tab to a URL (`waitUntil`: `'none' \| 'interactive' \| 'complete'`) |
| `browser_observe` | Distill the live DOM into a sanitized `<untrusted_dom>` semantic tree |
| `browser_act` | Execute natural-language intent (`click`, `type`, `select`, `press`, `scroll`) via cache or MCP Sampling |
| `browser_extract` | Extract structured JSON from the current page matching requested field descriptions |
| `browser_click` | Deterministically click by numeric `[id]` or CSS selector |
| `browser_type` | Deterministically type into an input/textarea by `[id]` or CSS selector |
| `browser_select` | Select an `<option>` in a `<select>` element by `[id]` or CSS selector |
| `browser_press` | Dispatch keyboard key press (`Enter`, `Escape`, `Tab`, etc.) on an element |
| `browser_scroll` | Scroll the viewport or a specific element into view |
| `browser_fork` | Clone live session state into an isolated speculative branch tab |
| `browser_list_pages` | List all active browser pages/tabs and their URLs |
| `browser_screenshot` | Capture PNG screenshot (with optional `setOfMark: true` `[id]` visual overlay) |
| `browser_purge` | Wipe local self-healing locator cache and session state |

---

## Documentation

- [Product Requirements Document (`PRD.md`)](./PRD.md)
- [Architecture & Technical Specification (`DOCUMENTATION.md`)](./DOCUMENTATION.md)
- [Entity-Relationship & State Diagrams (`ERD.md`)](./ERD.md)
- [CLI & Developer Design Guide (`DESIGN.md`)](./DESIGN.md)

## Development

```bash
bun install
npm run typecheck
npm run lint
npm run build
npm test
```

## License

[MIT](./LICENSE) © Roedy Rustam
