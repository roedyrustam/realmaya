# `realmaya`

AI-native headless browser automation library (Chrome & Firefox) with a **Token-Compressed Semantic Distiller**, **Self-Healing Locator Cache**, **Speculative Parallel Branching (`fork`)**, **Prompt-Injection Firewall**, and a built-in **MCP v1.x Server** (with **MCP Sampling**).

## Key Capabilities
- **Dual-Engine Headless Control:** Zero-driver headless Chrome (CDP) and Firefox (native WebDriver BiDi).
- **Token-Compressed Semantic Distiller:** Compresses 50k+ token DOMs into ~400–1,500 token `<untrusted_dom>` semantic trees in < 30 ms.
- **Provider-Agnostic + MCP Sampling:** Use any OpenAI-compatible/BYOK `LlmProvider`, or let your MCP host (Antigravity, Claude, Gemini) supply intelligence via `sampling/createMessage` with zero API keys.
- **Self-Healing Locator Cache:** Repeat `page.act()` calls resolve in < 5 ms with **0 LLM tokens** and automatically adapt to minor UI label changes.
- **Speculative Parallel Branching (`page.fork()`):** Clone live session state (URL, cookies, `localStorage`, `sessionStorage`) into isolated contexts with `await using` (`Symbol.asyncDispose`) and TTL auto-reaping.
- **Prompt-Injection Firewall:** Strips `display:none`, `visibility:hidden`, `opacity:0`, and zero-width character obfuscation before sending DOM context to an LLM.

## Quick Start (SDK)

```ts
import { launch, createOpenAiCompatibleProvider } from 'realmaya';
import { z } from 'zod';

const llm = createOpenAiCompatibleProvider({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

await using browser = await launch({ engine: 'chrome', headless: true, llm });
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

## Development

```bash
bun install
npm run typecheck
npm run build
npm test
```
