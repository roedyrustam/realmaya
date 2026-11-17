#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startHttpMcpServer, startStdioMcpServer } from '../src/mcp/server.js';
import { LocatorCache } from '../src/semantic/locator-cache.js';
import type { BrowserEngine } from '../src/types.js';

const DEFAULT_CACHE_PATH = join(homedir(), '.realmaya', 'locator-cache.json');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'help';

  if (command === 'mcp') {
    const engine: BrowserEngine = args.includes('--firefox') ? 'firefox' : 'chrome';
    const headless = !args.includes('--headed') && !args.includes('--headless=false');
    const isHttp = args.includes('--http');
    const portIdx = args.indexOf('--port');
    const port = portIdx !== -1 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 3333;

    if (isHttp) {
      await startHttpMcpServer(port, { engine, headless, cachePath: DEFAULT_CACHE_PATH });
      console.error(
        `[realmaya] MCP Streamable HTTP server listening on http://127.0.0.1:${port}/mcp`,
      );
    } else {
      await startStdioMcpServer({ engine, headless, cachePath: DEFAULT_CACHE_PATH });
    }
    return;
  }

  if (command === 'purge') {
    const cache = new LocatorCache(DEFAULT_CACHE_PATH);
    await cache.purge();
    console.log('Cleared local realmaya locator cache.');
    return;
  }

  console.log(
    [
      'realmaya — AI-Native Headless Browser & MCP Server (Chrome & Firefox)',
      '',
      'Usage:',
      '  realmaya mcp [--chrome|--firefox] [--headed|--headless=false]   Start MCP server over stdio',
      '  realmaya mcp --http [--port 3333] [--headed|--headless=false]   Start MCP server over Streamable HTTP',
      '  realmaya purge                                                  Wipe local self-healing locator cache',
      '',
      'MCP Tools:',
      '  browser_launch       Launch headless Chrome or Firefox via WebDriver BiDi',
      '  browser_navigate     Navigate active or specified page to a URL',
      '  browser_observe      Extract token-compressed, prompt-injection-sanitized Semantic Tree',
      '  browser_act          Execute natural-language intent via self-healing cache or MCP Sampling',
      '  browser_extract      Extract structured JSON data from page content',
      '  browser_click        Click element by distilled numeric ID or CSS selector',
      '  browser_type         Type text into input element by numeric ID or CSS selector',
      '  browser_select       Select an option in a <select> element by numeric ID or CSS selector',
      '  browser_press        Press a keyboard key on an element by numeric ID or CSS selector',
      '  browser_scroll       Scroll the page or a specific element',
      '  browser_fork         Speculatively fork current page into an isolated parallel branch',
      '  browser_list_pages   List all open pages and speculative fork() branches',
      '  browser_screenshot   Capture PNG screenshot with optional Set-of-Mark [id] overlays',
      '  browser_purge        Clear all local locator caches and session data (GDPR Art. 17)',
      '  browser_close        Close a specific page/branch or shut down the browser',
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error('[realmaya] Fatal error:', err);
  process.exit(1);
});
