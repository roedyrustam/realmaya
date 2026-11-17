import { describe, expect, it } from 'vitest';
import { buildDistillerExpression, formatDistilledPage } from '../../src/semantic/distiller.js';
import { sanitizeUntrustedText, wrapUntrustedDom } from '../../src/semantic/firewall.js';

describe('Prompt-Injection Firewall & Semantic Distiller', () => {
  it('strips zero-width obfuscation and control characters', () => {
    const dirty = 'Sign\u200B In\uFEFF\x07   Now\n\t!';
    expect(sanitizeUntrustedText(dirty)).toBe('Sign In Now !');
  });

  it('wraps distilled DOM inside <untrusted_dom> boundaries', () => {
    const wrapped = wrapUntrustedDom('https://example.com', 'Login Page', '[1] button "Submit"');
    expect(wrapped.startsWith('<untrusted_dom>')).toBe(true);
    expect(wrapped.endsWith('</untrusted_dom>')).toBe(true);
    expect(wrapped).toContain('URL: https://example.com');
    expect(wrapped).toContain('[1] button "Submit"');
  });

  it('enforces maxTokens budget and preserves strippedHiddenNodes count', () => {
    const nodes = Array.from({ length: 50 }, (_, idx) => ({
      id: idx + 1,
      role: 'button',
      name: `Action Button Number ${idx + 1} with long descriptive label`,
      tag: 'button',
      fingerprint: `button|button|action-${idx + 1}|`,
      selector: `[data-realmaya-id="${idx + 1}"]`,
      bbox: { x: 0, y: idx * 30, w: 120, h: 28 },
    }));

    const distilled = formatDistilledPage(
      {
        url: 'https://app.example.com',
        title: 'Dashboard',
        nodes,
        strippedHiddenNodes: 4,
      },
      { maxTokens: 120 },
    );

    expect(distilled.strippedHiddenNodes).toBe(4);
    expect(distilled.treeText).toContain('more elements truncated by token budget');
    expect(distilled.tokenEstimate).toBeLessThan(200);
  });

  it('generates a self-contained in-page distiller expression', () => {
    const expr = buildDistillerExpression({ mode: 'viewport' });
    expect(expr).toContain('data-realmaya-id');
    expect(expr).toContain('viewport');
    expect(expr.length).toBeLessThan(15_000);
  });
});
