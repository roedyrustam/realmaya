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
    select: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => {}),
    evaluate: async <T>() => undefined as T,
    observe: async () => snapshot,
    act: async () => ({ ok: true, action: 'noop', cached: false }),
    extract: async <T>() => ({}) as T,
    fork: async () => createMockPage(snapshot),
    screenshot: async () => '',
    cookies: async () => [],
    setCookies: async () => {},
    getNetworkLog: () => [],
    clearNetworkLog: () => {},
    mockRoute: vi.fn(async () => {}),
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

  it('executes select, press, and scroll actions planned by the LLM', async () => {
    const snapshot: DistilledPage = {
      url: 'https://app.test/form',
      title: 'Form',
      tokenEstimate: 50,
      treeText:
        '<untrusted_dom>\n[1] combobox "Country" options=["US", "ID"]\n[2] textbox "Search"\n</untrusted_dom>',
      strippedHiddenNodes: 0,
      nodes: [
        {
          id: 1,
          role: 'combobox',
          name: 'Country',
          tag: 'select',
          options: ['US', 'ID'],
          fingerprint: 'combobox|select|country|',
          selector: '[data-realmaya-id="1"]',
          bbox: { x: 0, y: 0, w: 120, h: 30 },
        },
        {
          id: 2,
          role: 'textbox',
          name: 'Search',
          tag: 'input',
          fingerprint: 'textbox|input|search|',
          selector: '[data-realmaya-id="2"]',
          bbox: { x: 0, y: 40, w: 200, h: 30 },
        },
      ],
    };

    const page = createMockPage(snapshot);

    const selectEngine = new IntentEngine(new LocatorCache(), {
      name: 'mock-select',
      completeJson: async () => ({ action: 'select', nodeId: 1, value: 'ID' }),
    });
    const selectRes = await selectEngine.act(page, 'select ID country');
    expect(selectRes).toMatchObject({ ok: true, action: 'select', nodeId: 1, cached: false });
    expect(page.select).toHaveBeenCalledWith(1, 'ID');

    const pressEngine = new IntentEngine(new LocatorCache(), {
      name: 'mock-press',
      completeJson: async () => ({ action: 'press', nodeId: 2, key: 'Enter' }),
    });
    const pressRes = await pressEngine.act(page, 'press Enter on search');
    expect(pressRes).toMatchObject({ ok: true, action: 'press', nodeId: 2, cached: false });
    expect(page.press).toHaveBeenCalledWith(2, 'Enter');

    const scrollEngine = new IntentEngine(new LocatorCache(), {
      name: 'mock-scroll',
      completeJson: async () => ({ action: 'scroll', scrollY: 650 }),
    });
    const scrollRes = await scrollEngine.act(page, 'scroll down the page');
    expect(scrollRes).toMatchObject({ ok: true, action: 'scroll', cached: false });
    expect(page.scroll).toHaveBeenCalledWith({ y: 650 });
  });

  it('enforces onDestructiveAction confirmation guard before executing destructive actions', async () => {
    const snapshot: DistilledPage = {
      url: 'https://bank.test/settings',
      title: 'Account Settings',
      tokenEstimate: 40,
      treeText: '<untrusted_dom>\n[5] button "Delete Account"\n</untrusted_dom>',
      strippedHiddenNodes: 0,
      nodes: [
        {
          id: 5,
          role: 'button',
          name: 'Delete Account',
          tag: 'button',
          fingerprint: 'button|button|delete account|',
          selector: '[data-realmaya-id="5"]',
          bbox: { x: 0, y: 0, w: 120, h: 32 },
        },
      ],
    };

    const llm: LlmProvider = {
      name: 'mock-llm',
      completeJson: async () => ({ action: 'click', nodeId: 5 }),
    };

    const pageBlocked = createMockPage(snapshot);
    const guardDeny = vi.fn(async () => false);
    const blockedEngine = new IntentEngine(new LocatorCache(), llm, guardDeny);

    const blockedResult = await blockedEngine.act(pageBlocked, 'delete account');
    expect(blockedResult.ok).toBe(false);
    expect(blockedResult.blockedByGuard).toBe(true);
    expect(blockedResult.nodeId).toBe(5);
    expect(pageBlocked.click).not.toHaveBeenCalled();
    expect(guardDeny).toHaveBeenCalledOnce();

    const pageAllowed = createMockPage(snapshot);
    const guardAllow = vi.fn(async () => true);
    const allowedEngine = new IntentEngine(new LocatorCache(), llm, guardAllow);

    const allowedResult = await allowedEngine.act(pageAllowed, 'delete account');
    expect(allowedResult.ok).toBe(true);
    expect(allowedResult.blockedByGuard).toBeUndefined();
    expect(pageAllowed.click).toHaveBeenCalledWith(5);
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
