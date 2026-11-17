import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocatorCache } from '../../src/semantic/locator-cache.js';
import type { SemanticNode } from '../../src/types.js';

function makeNode(overrides: Partial<SemanticNode> = {}): SemanticNode {
  return {
    id: 1,
    role: 'button',
    name: 'Proceed to Checkout',
    tag: 'button',
    fingerprint: 'button|button|proceed to checkout|',
    selector: '[data-realmaya-id="1"]',
    bbox: { x: 10, y: 20, w: 100, h: 40 },
    ...overrides,
  };
}

describe('Self-Healing LocatorCache', () => {
  it('resolves exact fingerprint matches and persists across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'realmaya-cache-'));
    const cacheFile = join(dir, 'cache.json');

    try {
      const cache1 = new LocatorCache(cacheFile);
      const node = makeNode();
      await cache1.record('https://shop.test', 'click checkout', node);

      const cache2 = new LocatorCache(cacheFile);
      const hit = await cache2.resolve('https://shop.test', 'click checkout', [node]);
      expect(hit?.id).toBe(1);

      await cache2.purge();
      expect(cache2.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('self-heals when button label changes slightly with same role', async () => {
    const cache = new LocatorCache();
    await cache.record(
      'https://shop.test',
      'click checkout',
      makeNode({ name: 'Proceed to Checkout Now', fingerprint: 'button|button|proceed to checkout now|' }),
    );

    const mutatedNode = makeNode({
      id: 7,
      name: 'Proceed to Checkout',
      fingerprint: 'button|button|proceed to checkout|',
    });

    const healed = await cache.resolve('https://shop.test', 'click checkout', [mutatedNode]);
    expect(healed?.id).toBe(7);
  });
});
