import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { McpSamplingProvider } from '../ai/mcp-sampling.js';
import { RealmayaBrowser } from '../browser/browser.js';
import { LocatorCache } from '../semantic/locator-cache.js';
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
export class RealmayaMcpSession {
  private browser: Browser | null = null;
  private readonly pages = new Map<string, Page>();
  private activePageId: string | null = null;
  private readonly defaultEngine: BrowserEngine;
  private readonly headless: boolean;
  private readonly llm: LlmProvider;
  private readonly cachePath: string | undefined;

  constructor(opts: McpServerOptions & { llm: LlmProvider }) {
    this.defaultEngine = opts.engine ?? 'chrome';
    this.headless = opts.headless ?? true;
    this.llm = opts.llm;
    this.cachePath = opts.cachePath;
  }

  async ensureBrowser(engine?: BrowserEngine): Promise<Browser> {
    if (!this.browser) {
      this.browser = await RealmayaBrowser.launch({
        engine: engine ?? this.defaultEngine,
        headless: this.headless,
        llm: this.llm,
        ...(this.cachePath ? { cachePath: this.cachePath } : {}),
      });
    }
    return this.browser;
  }

  async ensurePage(pageId?: string): Promise<Page> {
    if (pageId) {
      const existing = this.pages.get(pageId);
      if (!existing) throw new Error(`Page not found: ${pageId}`);
      this.activePageId = pageId;
      return existing;
    }

    if (this.activePageId) {
      const active = this.pages.get(this.activePageId);
      if (active) return active;
    }

    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    this.pages.set(page.id, page);
    this.activePageId = page.id;
    return page;
  }

  registerPage(page: Page): void {
    this.pages.set(page.id, page);
    this.activePageId = page.id;
  }

  listPages(): Array<{ pageId: string; contextId: string; isActive: boolean }> {
    return Array.from(this.pages.values()).map((page) => ({
      pageId: page.id,
      contextId: page.contextId,
      isActive: page.id === this.activePageId,
    }));
  }

  async purgeCache(): Promise<void> {
    if (this.browser) {
      await this.browser.clearAllData();
    }
    if (this.cachePath) {
      const cache = new LocatorCache(this.cachePath);
      await cache.purge();
    }
  }

  async closePage(pageId?: string): Promise<string> {
    const targetId = pageId ?? this.activePageId;
    if (!targetId) {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      return 'No active page; browser closed.';
    }

    const page = this.pages.get(targetId);
    if (page) {
      await page.close();
      this.pages.delete(targetId);
    }
    if (this.activePageId === targetId) {
      this.activePageId = this.pages.keys().next().value ?? null;
    }
    return `Closed page ${targetId}`;
  }

  async dispose(): Promise<void> {
    this.pages.clear();
    this.activePageId = null;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/** Creates and configures the `realmaya` MCP v1.x server with all browser & AI tools. */
export function createRealmayaMcpServer(opts: McpServerOptions = {}): {
  server: McpServer;
  session: RealmayaMcpSession;
} {
  const server = new McpServer({
    name: 'realmaya',
    version: '0.1.0',
  });

  const llm = opts.llm ?? new McpSamplingProvider(server);
  const session = new RealmayaMcpSession({ ...opts, llm });

  server.registerTool(
    'browser_launch',
    {
      description: 'Launch a headless Chrome or Firefox browser controlled via WebDriver BiDi.',
      inputSchema: {
        engine: z.enum(['chrome', 'firefox']).default('chrome'),
      },
    },
    async ({ engine }) => {
      await session.ensureBrowser(engine);
      const page = await session.ensurePage();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, engine, activePageId: page.id }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'browser_navigate',
    {
      description: 'Navigate the active (or specified) page to a URL.',
      inputSchema: {
        url: z.string().url(),
        pageId: z.string().optional(),
        waitUntil: z.enum(['none', 'interactive', 'complete']).optional(),
      },
    },
    async ({ url, pageId, waitUntil }) => {
      const page = await session.ensurePage(pageId);
      await page.goto(url, waitUntil ? { waitUntil } : undefined);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              pageId: page.id,
              url: await page.url(),
              title: await page.title(),
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'browser_observe',
    {
      description:
        'Extract a token-compressed, prompt-injection-sanitized Semantic Tree of interactive elements on the page.',
      inputSchema: {
        pageId: z.string().optional(),
        mode: z.enum(['interactive', 'viewport', 'full']).optional(),
        maxTokens: z.number().int().positive().max(8000).optional(),
      },
    },
    async ({ pageId, mode, maxTokens }) => {
      const page = await session.ensurePage(pageId);
      const distilled = await page.observe({
        ...(mode ? { mode } : {}),
        ...(maxTokens ? { maxTokens } : {}),
      });
      return {
        content: [
          {
            type: 'text',
            text: `${distilled.treeText}\n\n[meta] pageId=${page.id} nodes=${distilled.nodes.length} tokens~=${distilled.tokenEstimate} strippedHidden=${distilled.strippedHiddenNodes}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'browser_act',
    {
      description:
        'Execute a natural-language intent on the page using self-healing semantic cache or MCP Sampling.',
      inputSchema: {
        instruction: z.string().min(1),
        pageId: z.string().optional(),
      },
    },
    async ({ instruction, pageId }) => {
      const page = await session.ensurePage(pageId);
      const result = await page.act(instruction);
      return {
        content: [{ type: 'text', text: JSON.stringify({ pageId: page.id, ...result }) }],
      };
    },
  );

  server.registerTool(
    'browser_extract',
    {
      description:
        'Extract structured JSON data from the active or specified page using the Semantic Distiller.',
      inputSchema: {
        instruction: z.string().min(1),
        fields: z.array(z.string()).optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ instruction, fields, pageId }) => {
      const page = await session.ensurePage(pageId);
      const schema =
        fields && fields.length > 0
          ? z.object(Object.fromEntries(fields.map((f) => [f, z.unknown()])))
          : z.record(z.unknown());
      const extracted = await page.extract(instruction, schema);
      return {
        content: [{ type: 'text', text: JSON.stringify(extracted) }],
      };
    },
  );

  server.registerTool(
    'browser_click',
    {
      description: 'Click an element by its distilled numeric ID or CSS selector.',
      inputSchema: {
        selectorOrId: z.union([z.number().int().positive(), z.string().min(1)]),
        pageId: z.string().optional(),
      },
    },
    async ({ selectorOrId, pageId }) => {
      const page = await session.ensurePage(pageId);
      await page.click(selectorOrId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pageId: page.id }) }],
      };
    },
  );

  server.registerTool(
    'browser_type',
    {
      description: 'Type text into an input element by its distilled numeric ID or CSS selector.',
      inputSchema: {
        selectorOrId: z.union([z.number().int().positive(), z.string().min(1)]),
        text: z.string(),
        clear: z.boolean().optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ selectorOrId, text, clear, pageId }) => {
      const page = await session.ensurePage(pageId);
      await page.type(selectorOrId, text, clear !== undefined ? { clear } : undefined);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pageId: page.id }) }],
      };
    },
  );

  server.registerTool(
    'browser_select',
    {
      description:
        'Select an option in a <select> element by its distilled numeric ID or CSS selector.',
      inputSchema: {
        selectorOrId: z.union([z.number().int().positive(), z.string().min(1)]),
        value: z.string(),
        pageId: z.string().optional(),
      },
    },
    async ({ selectorOrId, value, pageId }) => {
      const page = await session.ensurePage(pageId);
      await page.select(selectorOrId, value);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pageId: page.id, value }) }],
      };
    },
  );

  server.registerTool(
    'browser_press',
    {
      description:
        'Press a keyboard key on an element by its distilled numeric ID or CSS selector.',
      inputSchema: {
        selectorOrId: z.union([z.number().int().positive(), z.string().min(1)]),
        key: z.string().min(1),
        pageId: z.string().optional(),
      },
    },
    async ({ selectorOrId, key, pageId }) => {
      const page = await session.ensurePage(pageId);
      await page.press(selectorOrId, key);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pageId: page.id, key }) }],
      };
    },
  );

  server.registerTool(
    'browser_scroll',
    {
      description: 'Scroll the page or a specific element by delta or into view.',
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        selectorOrId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
        pageId: z.string().optional(),
      },
    },
    async ({ x, y, selectorOrId, pageId }) => {
      const page = await session.ensurePage(pageId);
      await page.scroll({
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(selectorOrId !== undefined ? { selectorOrId } : {}),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pageId: page.id }) }],
      };
    },
  );

  server.registerTool(
    'browser_fork',
    {
      description:
        'Speculatively fork the current page (URL, cookies, storage) into an isolated parallel branch.',
      inputSchema: {
        pageId: z.string().optional(),
        ttlMs: z.number().int().positive().max(300_000).optional(),
      },
    },
    async ({ pageId, ttlMs }) => {
      const page = await session.ensurePage(pageId);
      const branch = await page.fork(ttlMs ? { ttlMs } : undefined);
      session.registerPage(branch);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              parentPageId: page.id,
              branchPageId: branch.id,
              contextId: branch.contextId,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'browser_list_pages',
    {
      description:
        'List all open pages and speculative fork() branches in the current MCP session.',
      inputSchema: {},
    },
    async () => {
      const pages = session.listPages();
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, pages }) }],
      };
    },
  );

  server.registerTool(
    'browser_screenshot',
    {
      description:
        'Capture a PNG screenshot of the active or specified page, with optional Set-of-Mark [id] overlays.',
      inputSchema: {
        pageId: z.string().optional(),
        setOfMark: z.boolean().optional(),
      },
    },
    async ({ pageId, setOfMark }) => {
      const page = await session.ensurePage(pageId);
      const data = await page.screenshot(setOfMark ? { setOfMark: true } : undefined);
      return {
        content: [{ type: 'image', data, mimeType: 'image/png' }],
      };
    },
  );

  server.registerTool(
    'browser_purge',
    {
      description:
        'Clear all local self-healing locator caches and session data (GDPR Art. 17 / local privacy compliance).',
      inputSchema: {},
    },
    async () => {
      await session.purgeCache();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              message: 'Cleared all local self-healing locator caches and session data.',
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'browser_close',
    {
      description: 'Close a specific page/branch, or shut down the browser if no pageId is given.',
      inputSchema: {
        pageId: z.string().optional(),
      },
    },
    async ({ pageId }) => {
      const message = await session.closePage(pageId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, message }) }],
      };
    },
  );

  return { server, session };
}

/** Starts the `realmaya` MCP server over `stdio`. */
export async function startStdioMcpServer(opts: McpServerOptions = {}): Promise<void> {
  const { server, session } = createRealmayaMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await session.dispose();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/** Starts the `realmaya` MCP server over Streamable HTTP on the given port. */
export async function startHttpMcpServer(port = 3333, opts: McpServerOptions = {}): Promise<void> {
  const { server, session } = createRealmayaMcpServer(opts);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (req.url === '/mcp') {
      await transport.handleRequest(req, res);
      return;
    }
    res.writeHead(404).end('Not Found');
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, '127.0.0.1', resolve);
  });

  const shutdown = async () => {
    httpServer.close();
    await session.dispose();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
