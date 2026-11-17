import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Browser, BrowserEngine, LlmProvider, Page } from '../types.js';
export interface McpServerOptions {
    engine?: BrowserEngine;
    headless?: boolean;
    llm?: LlmProvider;
    cachePath?: string;
}
/**
 * Stateful session registry bridging MCP tool calls to live `realmaya`
 * browser instances, pages, and speculative `fork()` branches.
 */
export declare class RealmayaMcpSession {
    private browser;
    private readonly pages;
    private activePageId;
    private readonly defaultEngine;
    private readonly headless;
    private readonly llm;
    private readonly cachePath;
    constructor(opts: McpServerOptions & {
        llm: LlmProvider;
    });
    ensureBrowser(engine?: BrowserEngine): Promise<Browser>;
    ensurePage(pageId?: string): Promise<Page>;
    registerPage(page: Page): void;
    closePage(pageId?: string): Promise<string>;
    dispose(): Promise<void>;
}
/** Creates and configures the `realmaya` MCP v1.x server with all browser & AI tools. */
export declare function createRealmayaMcpServer(opts?: McpServerOptions): {
    server: McpServer;
    session: RealmayaMcpSession;
};
/** Starts the `realmaya` MCP server over `stdio`. */
export declare function startStdioMcpServer(opts?: McpServerOptions): Promise<void>;
/** Starts the `realmaya` MCP server over Streamable HTTP on the given port. */
export declare function startHttpMcpServer(port?: number, opts?: McpServerOptions): Promise<void>;
//# sourceMappingURL=server.d.ts.map