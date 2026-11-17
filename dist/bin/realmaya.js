#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startHttpMcpServer, startStdioMcpServer } from '../src/mcp/server.js';
import { LocatorCache } from '../src/semantic/locator-cache.js';
const DEFAULT_CACHE_PATH = join(homedir(), '.realmaya', 'locator-cache.json');
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] ?? 'help';
    if (command === 'mcp') {
        const engine = args.includes('--firefox') ? 'firefox' : 'chrome';
        const isHttp = args.includes('--http');
        const portIdx = args.indexOf('--port');
        const port = portIdx !== -1 && args[portIdx + 1] ? Number(args[portIdx + 1]) : 3333;
        if (isHttp) {
            await startHttpMcpServer(port, { engine, cachePath: DEFAULT_CACHE_PATH });
            console.error(`[realmaya] MCP Streamable HTTP server listening on http://127.0.0.1:${port}/mcp`);
        }
        else {
            await startStdioMcpServer({ engine, cachePath: DEFAULT_CACHE_PATH });
        }
        return;
    }
    if (command === 'purge') {
        const cache = new LocatorCache(DEFAULT_CACHE_PATH);
        await cache.purge();
        console.log('Cleared local realmaya locator cache.');
        return;
    }
    console.log([
        'realmaya — AI-Native Headless Browser & MCP Server (Chrome & Firefox)',
        '',
        'Usage:',
        '  realmaya mcp [--chrome|--firefox]           Start MCP server over stdio',
        '  realmaya mcp --http [--port 3333]           Start MCP server over Streamable HTTP',
        '  realmaya purge                              Wipe local self-healing locator cache',
    ].join('\n'));
}
main().catch((err) => {
    console.error('[realmaya] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=realmaya.js.map