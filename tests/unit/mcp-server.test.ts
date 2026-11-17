import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extractJsonObject } from '../../src/ai/provider.js';
import { createRealmayaMcpServer } from '../../src/mcp/server.js';
import type { Page } from '../../src/types.js';

function makeStubPage(id: string, contextId: string): Page {
  return {
    id,
    contextId,
    url: async () => 'https://example.com',
    title: async () => 'Example',
    goto: async () => {},
    click: async () => {},
    type: async () => {},
    select: async () => {},
    press: async () => {},
    scroll: async () => {},
    waitForSelector: async () => {},
    evaluate: async <T>() => undefined as T,
    observe: async () => ({
      url: 'https://example.com',
      title: 'Example',
      tokenEstimate: 10,
      treeText: '<untrusted_dom></untrusted_dom>',
      nodes: [],
      strippedHiddenNodes: 0,
    }),
    act: async () => ({ ok: true, action: 'noop', cached: false }),
    extract: async <T>() => ({}) as T,
    fork: async () => makeStubPage(`${id}-fork`, `${contextId}-fork`),
    screenshot: async () => '',
    cookies: async () => [],
    setCookies: async () => {},
    getNetworkLog: () => [],
    clearNetworkLog: () => {},
    mockRoute: async () => {},
    close: vi.fn(async () => {}),
    [Symbol.asyncDispose]: async () => {},
  };
}

describe('MCP Server & JSON Extractor', () => {
  it('extracts JSON from fenced markdown blocks', () => {
    const parsed = extractJsonObject('```json\n{"action":"click","nodeId":2}\n```');
    expect(parsed).toEqual({ action: 'click', nodeId: 2 });
  });

  it('registers all 15 browser & AI tools and manages RealmayaMcpSession lifecycle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'realmaya-mcp-'));
    const cachePath = join(dir, 'cache.json');
    writeFileSync(cachePath, '{}', 'utf8');

    try {
      const { server, session } = createRealmayaMcpServer({ cachePath });
      expect(server).toBeDefined();
      expect(session).toBeDefined();

      const registeredTools = (server as unknown as { _registeredTools?: Record<string, unknown> })
        ._registeredTools;
      if (registeredTools) {
        expect(Object.keys(registeredTools)).toEqual(
          expect.arrayContaining([
            'browser_launch',
            'browser_navigate',
            'browser_observe',
            'browser_act',
            'browser_extract',
            'browser_click',
            'browser_type',
            'browser_select',
            'browser_press',
            'browser_scroll',
            'browser_fork',
            'browser_list_pages',
            'browser_screenshot',
            'browser_purge',
            'browser_close',
          ]),
        );
      }

      const page1 = makeStubPage('p-1', 'ctx-1');
      const page2 = makeStubPage('p-2', 'ctx-2');
      session.registerPage(page1);
      session.registerPage(page2);

      const listed = session.listPages();
      expect(listed).toEqual([
        { pageId: 'p-1', contextId: 'ctx-1', isActive: false },
        { pageId: 'p-2', contextId: 'ctx-2', isActive: true },
      ]);

      const closeMsg = await session.closePage('p-2');
      expect(closeMsg).toBe('Closed page p-2');
      expect(session.listPages()).toEqual([{ pageId: 'p-1', contextId: 'ctx-1', isActive: true }]);

      await session.purgeCache();
      await session.dispose();
      expect(session.listPages()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
