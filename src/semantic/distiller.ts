import type { DistilledPage, ObserveOptions, SemanticNode } from '../types.js';
import { sanitizeUntrustedText, wrapUntrustedDom } from './firewall.js';

export interface RawDistillPayload {
  url: string;
  title: string;
  nodes: Array<{
    id: number;
    role: string;
    name: string;
    tag: string;
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    fingerprint: string;
    selector: string;
    bbox: { x: number; y: number; w: number; h: number };
  }>;
  strippedHiddenNodes: number;
}

/**
 * Generates a self-contained in-page JavaScript expression (<15KB) that extracts
 * an interactive, token-compressed semantic tree and stamps `[data-realmaya-id]`.
 */
export function buildDistillerExpression(opts: ObserveOptions = {}): string {
  const mode = opts.mode ?? 'interactive';
  const maxNodes = mode === 'full' ? 400 : 180;

  return `(() => {
    const MODE = ${JSON.stringify(mode)};
    const MAX_NODES = ${maxNodes};
    const INTERACTIVE_SELECTOR = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    let strippedHiddenNodes = 0;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;

    function isElementVisible(el) {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      if (MODE === 'viewport') {
        if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
          return false;
        }
      }
      return true;
    }

    function computeRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit.toLowerCase();
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'select') return 'combobox';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
        return 'textbox';
      }
      return tag;
    }

    function computeName(el) {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const parts = labelledBy
          .split(/\\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || '')
          .filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
      }

      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label && label.textContent?.trim()) return label.textContent.trim();
      }

      const text = (el.innerText || el.textContent || '').trim();
      if (text) return text.slice(0, 140);

      const placeholder = el.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) return placeholder.trim();

      const title = el.getAttribute('title');
      if (title && title.trim()) return title.trim();

      const alt = el.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim();

      return el.getAttribute('name') || '';
    }

    function buildSelector(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 4) {
        let seg = cur.tagName.toLowerCase();
        const parent = cur.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (siblings.length > 1) {
            seg += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
          }
        }
        parts.unshift(seg);
        cur = parent;
      }
      return parts.join(' > ');
    }

    const candidates = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
    const nodes = [];
    let nextId = 1;

    for (const el of candidates) {
      if (nodes.length >= MAX_NODES) break;
      if (!isElementVisible(el)) {
        strippedHiddenNodes++;
        continue;
      }

      const id = nextId++;
      el.setAttribute('data-realmaya-id', String(id));
      const rect = el.getBoundingClientRect();
      const role = computeRole(el);
      const tag = el.tagName.toLowerCase();
      const name = computeName(el).replace(/\\s+/g, ' ').slice(0, 120);
      const placeholder = el.getAttribute('placeholder') || undefined;
      const value =
        tag === 'input' || tag === 'textarea' || tag === 'select'
          ? String(el.value ?? '').slice(0, 80)
          : undefined;
      const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true');
      const fingerprint = [role, tag, name.toLowerCase(), (placeholder || '').toLowerCase()].join('|');

      nodes.push({
        id,
        role,
        name,
        tag,
        ...(value ? { value } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(disabled ? { disabled: true } : {}),
        fingerprint,
        selector: '[data-realmaya-id="' + id + '"]',
        bbox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        _fallbackSelector: buildSelector(el),
      });
    }

    return {
      url: window.location.href,
      title: document.title || '',
      nodes: nodes.map(({ _fallbackSelector, ...rest }) => ({
        ...rest,
        selector: rest.selector || _fallbackSelector,
      })),
      strippedHiddenNodes,
    };
  })()`;
}

/**
 * Formats raw distilled DOM nodes into a token-budgeted, `<untrusted_dom>`-wrapped
 * representation for LLM reasoning.
 */
export function formatDistilledPage(
  raw: RawDistillPayload,
  opts: ObserveOptions = {},
): DistilledPage {
  const maxTokens = opts.maxTokens ?? 1500;
  const maxChars = maxTokens * 4;

  const sanitizedNodes: SemanticNode[] = raw.nodes.map((node) => ({
    ...node,
    name: sanitizeUntrustedText(node.name, 120),
    ...(node.value !== undefined ? { value: sanitizeUntrustedText(node.value, 80) } : {}),
    ...(node.placeholder !== undefined
      ? { placeholder: sanitizeUntrustedText(node.placeholder, 80) }
      : {}),
  }));

  const lines: string[] = [];
  let charCount = 0;

  for (const node of sanitizedNodes) {
    const parts = [`[${node.id}]`, node.role];
    if (node.name) parts.push(`"${node.name}"`);
    if (node.placeholder && node.placeholder !== node.name) {
      parts.push(`placeholder="${node.placeholder}"`);
    }
    if (node.value) parts.push(`value="${node.value}"`);
    if (node.disabled) parts.push('(disabled)');

    const line = parts.join(' ');
    if (charCount + line.length + 1 > maxChars) {
      lines.push(`... (${sanitizedNodes.length - lines.length} more elements truncated by token budget)`);
      break;
    }
    lines.push(line);
    charCount += line.length + 1;
  }

  const treeText = wrapUntrustedDom(
    raw.url,
    raw.title,
    lines.length > 0 ? lines.join('\n') : '(no interactive elements)',
  );

  return {
    url: raw.url,
    title: raw.title,
    tokenEstimate: Math.ceil(treeText.length / 4),
    treeText,
    nodes: sanitizedNodes,
    strippedHiddenNodes: raw.strippedHiddenNodes,
  };
}
