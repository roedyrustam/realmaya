import type { DistilledPage, ObserveOptions, SemanticNode } from '../types.js';
import {
  detectPromptInjectionPatterns,
  sanitizeUntrustedText,
  wrapUntrustedDom,
} from './firewall.js';

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
    options?: string[];
    disabled?: boolean;
    fingerprint: string;
    selector: string;
    fallbackSelector?: string;
    bbox: { x: number; y: number; w: number; h: number };
  }>;
  contentBlocks?: string[];
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

    const CONTENT_SELECTOR = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'li', 'th', 'td', 'pre', 'code', 'blockquote', 'summary',
      '[role="heading"]', '[role="alert"]', '[role="status"]'
    ].join(',');

    let strippedHiddenNodes = 0;
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 720;

    function collectAllElements(root, selector) {
      const results = Array.from(root.querySelectorAll(selector));
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          results.push(...collectAllElements(el.shadowRoot, selector));
        }
      }
      return results;
    }

    function isElementVisible(el) {
      let cur = el;
      while (cur && cur.nodeType === 1) {
        if (cur.getAttribute('aria-hidden') === 'true' || cur.hasAttribute('hidden')) {
          return false;
        }
        const style = window.getComputedStyle(cur);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          parseFloat(style.opacity || '1') === 0 ||
          parseFloat(style.fontSize || '12') === 0 ||
          style.clipPath === 'inset(100%)'
        ) {
          return false;
        }
        const rootNode = cur.getRootNode && cur.getRootNode();
        cur = cur.parentElement || (rootNode && rootNode.host) || null;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left < -1000 || rect.top < -1000) {
        return false;
      }
      if (MODE === 'viewport') {
        if (rect.top > vh || rect.left > vw) {
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

    const candidates = collectAllElements(document, INTERACTIVE_SELECTOR);
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
      const options =
        tag === 'select'
          ? Array.from(el.querySelectorAll('option'))
              .filter((opt) => !opt.disabled && !opt.hidden)
              .slice(0, 20)
              .map((opt) => (opt.textContent || opt.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60))
              .filter(Boolean)
          : undefined;
      const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true');
      const fingerprint = [role, tag, name.toLowerCase(), (placeholder || '').toLowerCase()].join('|');
      const fallbackSelector = buildSelector(el);

      nodes.push({
        id,
        role,
        name,
        tag,
        ...(value ? { value } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(options && options.length > 0 ? { options } : {}),
        ...(disabled ? { disabled: true } : {}),
        fingerprint,
        selector: '[data-realmaya-id="' + id + '"]',
        fallbackSelector,
        bbox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      });
    }

    let contentBlocks;
    if (MODE === 'full') {
      contentBlocks = [];
      const seenTexts = new Set();
      const contentCandidates = collectAllElements(document, CONTENT_SELECTOR);
      for (const cEl of contentCandidates) {
        if (contentBlocks.length >= 120) break;
        if (!isElementVisible(cEl)) {
          strippedHiddenNodes++;
          continue;
        }
        const rawText = (cEl.innerText || cEl.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!rawText || seenTexts.has(rawText)) continue;
        seenTexts.add(rawText);
        const cTag = cEl.tagName.toLowerCase();
        const isHeading = /^h[1-6]$/.test(cTag) || cEl.getAttribute('role') === 'heading';
        const prefix = isHeading ? '[heading]' : '[text]';
        contentBlocks.push(prefix + ' ' + rawText.slice(0, 200));
      }
    }

    return {
      url: window.location.href,
      title: document.title || '',
      nodes,
      ...(contentBlocks ? { contentBlocks } : {}),
      strippedHiddenNodes,
    };
  })()`;
}

/**
 * Generates an in-page expression that renders numbered Set-of-Mark (`[id]`)
 * bounding-box overlays on all `[data-realmaya-id]` elements for visual grounding.
 */
export function buildSetOfMarkExpression(): string {
  return `(() => {
    const existing = document.getElementById('__realmaya_som_overlay__');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = '__realmaya_som_overlay__';
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;';

    const elements = document.querySelectorAll('[data-realmaya-id]');
    let count = 0;
    for (const el of elements) {
      const id = el.getAttribute('data-realmaya-id');
      if (!id) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const box = document.createElement('div');
      box.style.cssText = [
        'position:fixed',
        'left:' + Math.max(0, Math.round(rect.left)) + 'px',
        'top:' + Math.max(0, Math.round(rect.top)) + 'px',
        'width:' + Math.round(rect.width) + 'px',
        'height:' + Math.round(rect.height) + 'px',
        'border:2px solid #e11d48',
        'background:rgba(225,29,72,0.08)',
        'box-sizing:border-box',
        'pointer-events:none'
      ].join(';');

      const badge = document.createElement('span');
      badge.textContent = '[' + id + ']';
      badge.style.cssText = [
        'position:absolute',
        'top:-18px',
        'left:-2px',
        'background:#e11d48',
        'color:#ffffff',
        'font:bold 11px/14px monospace',
        'padding:1px 4px',
        'border-radius:2px',
        'white-space:nowrap'
      ].join(';');

      box.appendChild(badge);
      container.appendChild(box);
      count++;
    }

    document.documentElement.appendChild(container);
    return count;
  })()`;
}

/**
 * Generates an in-page expression that removes the Set-of-Mark overlay container.
 */
export function buildRemoveSetOfMarkExpression(): string {
  return `(() => {
    const existing = document.getElementById('__realmaya_som_overlay__');
    if (existing) existing.remove();
    return true;
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
  let strippedHiddenNodes = raw.strippedHiddenNodes;

  const sanitizedNodes: SemanticNode[] = [];
  for (const node of raw.nodes) {
    if (
      detectPromptInjectionPatterns(node.name) ||
      (node.placeholder && detectPromptInjectionPatterns(node.placeholder)) ||
      (node.value && detectPromptInjectionPatterns(node.value))
    ) {
      strippedHiddenNodes += 1;
      continue;
    }

    let sanitizedOptions: string[] | undefined;
    if (node.options && node.options.length > 0) {
      sanitizedOptions = [];
      for (const opt of node.options) {
        if (detectPromptInjectionPatterns(opt)) {
          strippedHiddenNodes += 1;
          continue;
        }
        const cleanOpt = sanitizeUntrustedText(opt, 60);
        if (cleanOpt) {
          sanitizedOptions.push(cleanOpt);
        }
      }
    }

    sanitizedNodes.push({
      ...node,
      name: sanitizeUntrustedText(node.name, 120),
      ...(node.value !== undefined ? { value: sanitizeUntrustedText(node.value, 80) } : {}),
      ...(node.placeholder !== undefined
        ? { placeholder: sanitizeUntrustedText(node.placeholder, 80) }
        : {}),
      ...(sanitizedOptions && sanitizedOptions.length > 0 ? { options: sanitizedOptions } : {}),
    });
  }

  let sanitizedContentBlocks: string[] | undefined;
  if (raw.contentBlocks) {
    sanitizedContentBlocks = [];
    for (const block of raw.contentBlocks) {
      if (detectPromptInjectionPatterns(block)) {
        strippedHiddenNodes += 1;
        continue;
      }
      const cleanBlock = sanitizeUntrustedText(block, 200);
      if (cleanBlock) {
        sanitizedContentBlocks.push(cleanBlock);
      }
    }
  }

  const lines: string[] = [];
  let charCount = 0;

  for (const node of sanitizedNodes) {
    const parts = [`[${node.id}]`, node.role];
    if (node.name) parts.push(`"${node.name}"`);
    if (node.placeholder && node.placeholder !== node.name) {
      parts.push(`placeholder="${node.placeholder}"`);
    }
    if (node.value) parts.push(`value="${node.value}"`);
    if (node.options && node.options.length > 0) {
      parts.push(`options=[${node.options.map((o) => `"${o}"`).join(', ')}]`);
    }
    if (node.disabled) parts.push('(disabled)');

    const line = parts.join(' ');
    if (charCount + line.length + 1 > maxChars) {
      lines.push(
        `... (${sanitizedNodes.length - lines.length} more elements truncated by token budget)`,
      );
      break;
    }
    lines.push(line);
    charCount += line.length + 1;
  }

  if (sanitizedContentBlocks && sanitizedContentBlocks.length > 0) {
    const header = '--- CONTENT ---';
    if (charCount + header.length + 1 <= maxChars) {
      lines.push(header);
      charCount += header.length + 1;
      for (const block of sanitizedContentBlocks) {
        if (charCount + block.length + 1 > maxChars) {
          break;
        }
        lines.push(block);
        charCount += block.length + 1;
      }
    }
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
    ...(sanitizedContentBlocks ? { contentBlocks: sanitizedContentBlocks } : {}),
    strippedHiddenNodes,
  };
}
