import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { IntentEngine } from '../../src/ai/intent-engine.js';
import { BranchManager } from '../../src/browser/branch-manager.js';
import { LocatorCache } from '../../src/semantic/locator-cache.js';
import type { DistilledPage, LlmProvider, Page } from '../../src/types.js';

function createMockPage(snapshot: DistilledPage): Page {
  return {
    id: 'page-1',
    contextId: 'ctx-1',
    url: async () => snapshot.url,
    title: async () => snapshot.title,
    goto: async () => {},
    click: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    evaluate: async <T>() => undefined as T,
    observe: async () => snapshot,
    act: async () => ({ ok: true, action: 'noop', cached: false }),
    extract: async <T>() => ({} as T),
    fork: async () => createMockPage(snapshot),
    screenshot: async () => '',
    cookies: async () => [],
    setCookies: async () => {},
    close: vi.fn(async () => {}),
    [Symbol.asyncDispose]: async () => {},
  };
}

describe('IntentEngine & BranchManager', () => {
  it('uses LLM on first act() and resolves from cache with 0 LLM calls on repeat', async () => {
    const snapshot: DistilledPage = {
      url: 'https://app.test/login',
      title: 'Login',
      tokenEstimate: 40,
      treeText: '<untrusted_dom>\n[3] button "Sign In"\n</untrusted_dom>',
      strippedHiddenNodes: 0,
      nodes: [
        {
          id: 3,
          role: 'button',
          name: 'Sign In',
          tag: 'button',
          fingerprint: 'button|button|sign in|',
          selector: '[data-realmaya-id="3"]',
          bbox: { x: 0, y: 0, w: 80, h: 30 },
        },
      ],
    };

    const llm: LlmProvider = {
      name: 'mock-llm',
      completeJson: vi.fn(async () => ({ action: 'click', nodeId: 3, reason: 'Matches Sign In' })),
    };

    const page = createMockPage(snapshot);
    const engine = new IntentEngine(new LocatorCache(), llm);

    const first = await engine.act(page, 'click sign in');
    expect(first.ok).toBe(true);
    expect(first.cached).toBe(false);
    expect(first.nodeId).toBe(3);

    const second = await engine.act(page, 'click sign in');
    expect(second.ok).toBe(true);
    expect(second.cached).toBe(true);
    expect(llm.completeJson).toHaveBeenCalledTimes(1);
  });

  it('extracts structured Zod output via LlmProvider', async () => {
    const snapshot: DistilledPage = {
      url: 'https://shop.test/item',
      title: 'Item',
      tokenEstimate: 30,
      treeText: '<untrusted_dom>\nProduct: Pro Plan $29\n</untrusted_dom>',
      strippedHiddenNodes: 0,
      nodes: [],
    };
    const llm: LlmProvider = {
      name: 'mock-llm',
      completeJson: async () => ({ name: 'Pro Plan', price: 29 }),
    };
    const engine = new IntentEngine(new LocatorCache(), llm);
    const result = await engine.extract(
      createMockPage(snapshot),
      'extract product',
      z.object({ name: z.string(), price: z.number() }),
    );
    expect(result).toEqual({ name: 'Pro Plan', price: 29 });
  });

  it('enforces maxBranches limit and reaps closed branches', async () => {
    const manager = new BranchManager(2);
    const dummy = (id: string): Page => ({
      ...createMockPage({
        url: 'about:blank',
        title: '',
        tokenEstimate: 0,
        treeText: '',
        strippedHiddenNodes: 0,
        nodes: [],
      }),
      id,
    });

    manager.register(dummy('b1'), 60_000);
    manager.register(dummy('b2'), 60_000);
    expect(() => manager.register(dummy('b3'), 60_000)).toThrow(/branch limit reached/i);

    await manager.closeAll();
    expect(manager.count).toBe(0);
  });
});
