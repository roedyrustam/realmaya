import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';
import type { IntentEngine } from '../ai/intent-engine.js';
import type { DriverAdapter, PageHandle } from '../protocol/driver-adapter.js';
import {
  type RawDistillPayload,
  buildDistillerExpression,
  buildRemoveSetOfMarkExpression,
  buildSetOfMarkExpression,
  formatDistilledPage,
} from '../semantic/distiller.js';
import type {
  ActionResult,
  AgentLoopOptions,
  AgentLoopResult,
  BrowserCookie,
  ClickOptions,
  DistilledPage,
  ForkOptions,
  MockRouteResponse,
  NavigateOptions,
  NetworkExchange,
  ObserveOptions,
  Page,
  ScreenshotOptions,
  ScrollOptions,
  SemanticNode,
  StorageState,
  WaitForNetworkIdleOptions,
  WaitForStableOptions,
} from '../types.js';
import type { BranchManager } from './branch-manager.js';

interface NormalizedMockRoute {
  urlSubstring: string;
  status: number;
  contentType: string;
  bodyText: string;
  headers: Record<string, string>;
}

const FIND_ELEMENT_HELPER = `
  function findEl(sel, fallback) {
    function queryDeep(root, s) {
      if (!s) return null;
      try {
        const found = root.querySelector(s);
        if (found) return found;
      } catch {
        return null;
      }
      const all = root.querySelectorAll('*');
      for (const node of all) {
        if (node.shadowRoot) {
          const inner = queryDeep(node.shadowRoot, s);
          if (inner) return inner;
        }
        if (node.tagName && node.tagName.toUpperCase() === 'IFRAME') {
          try {
            if (node.contentDocument) {
              const innerFrame = queryDeep(node.contentDocument, s);
              if (innerFrame) return innerFrame;
            }
          } catch {}
        }
      }
      return null;
    }
    return queryDeep(document, sel) || (fallback ? queryDeep(document, fallback) : null);
  }

  function getElementViewportCenter(el) {
    const rect = el.getBoundingClientRect();
    let offsetX = 0;
    let offsetY = 0;
    try {
      let win = el.ownerDocument ? el.ownerDocument.defaultView : null;
      while (win && win !== window && win.frameElement) {
        const fr = win.frameElement.getBoundingClientRect();
        offsetX += fr.left;
        offsetY += fr.top;
        win = win.parent;
      }
    } catch {}
    return {
      x: Math.round(rect.left + offsetX + rect.width / 2),
      y: Math.round(rect.top + offsetY + rect.height / 2),
    };
  }
`;

export class RealmayaPage implements Page {
  readonly id: string;
  readonly contextId: string;

  private readonly driver: DriverAdapter;
  private readonly handle: PageHandle;
  private readonly ownsContext: boolean;
  private readonly intentEngine: IntentEngine;
  private readonly branchManager: BranchManager;
  private readonly onClosed: (pageId: string) => void;
  private readonly lastNodes = new Map<number, SemanticNode>();
  private readonly networkLog: NetworkExchange[] = [];
  private readonly mockedRoutes: NormalizedMockRoute[] = [];
  private readonly unsubNetwork: (() => void) | undefined;
  private lastNetworkTimestamp = Date.now();
  private closed = false;

  constructor(params: {
    driver: DriverAdapter;
    handle: PageHandle;
    ownsContext: boolean;
    intentEngine: IntentEngine;
    branchManager: BranchManager;
    onClosed: (pageId: string) => void;
  }) {
    this.driver = params.driver;
    this.handle = params.handle;
    this.ownsContext = params.ownsContext;
    this.intentEngine = params.intentEngine;
    this.branchManager = params.branchManager;
    this.onClosed = params.onClosed;
    this.id = params.handle.pageId;
    this.contextId = params.handle.contextId;
    this.unsubNetwork = this.driver.onNetworkExchange?.((entry) => {
      this.networkLog.push(entry);
      this.lastNetworkTimestamp = Date.now();
    });
  }

  private resolveSelectors(selectorOrId: string | number): {
    primary: string;
    fallback?: string;
  } {
    if (typeof selectorOrId === 'number') {
      const fallback = this.lastNodes.get(selectorOrId)?.fallbackSelector;
      return {
        primary: `[data-realmaya-id="${selectorOrId}"]`,
        ...(fallback ? { fallback } : {}),
      };
    }
    return { primary: selectorOrId };
  }

  async url(): Promise<string> {
    return this.evaluate<string>('window.location.href');
  }

  async title(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  async goto(url: string, opts?: NavigateOptions): Promise<void> {
    this.assertOpen();
    await this.driver.navigate(this.handle, url, opts);
    if (this.mockedRoutes.length > 0) {
      for (const route of this.mockedRoutes) {
        await this.injectMockRoute(route).catch(() => {});
      }
    }
  }

  async click(selectorOrId: string | number, opts?: ClickOptions): Promise<void> {
    this.assertOpen();
    const { primary, fallback } = this.resolveSelectors(selectorOrId);

    if (opts?.trusted && this.driver.dispatchClick) {
      const center = await this.evaluate<{ x: number; y: number } | null>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (typeof el.focus === 'function') el.focus();
        return getElementViewportCenter(el);
      })()`);

      if (!center) {
        throw new Error(`Element not found for click: ${primary}`);
      }
      await this.driver.dispatchClick(this.handle, center.x, center.y);
      return;
    }

    const ok = await this.evaluate<boolean>(`(() => {
      ${FIND_ELEMENT_HELPER}
      const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof el.focus === 'function') el.focus();
      el.click();
      return true;
    })()`);

    if (!ok) {
      throw new Error(`Element not found for click: ${primary}`);
    }
  }

  async type(
    selectorOrId: string | number,
    text: string,
    opts?: { clear?: boolean; trusted?: boolean },
  ): Promise<void> {
    this.assertOpen();
    const { primary, fallback } = this.resolveSelectors(selectorOrId);
    const clear = opts?.clear ?? false;

    if (opts?.trusted && this.driver.dispatchKeys) {
      const focused = await this.evaluate<boolean>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (typeof el.focus === 'function') el.focus();
        if (${clear}) {
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      })()`);

      if (!focused) {
        throw new Error(`Element not found for type: ${primary}`);
      }

      await this.driver.dispatchKeys(this.handle, text);
      await this.evaluate<boolean>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
        if (!el) return false;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      return;
    }

    const ok = await this.evaluate<boolean>(`(() => {
      ${FIND_ELEMENT_HELPER}
      const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof el.focus === 'function') el.focus();
      const nextVal = ${clear ? '""' : '(el.value ?? "")'} + ${JSON.stringify(text)};
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, nextVal);
      } else {
        el.value = nextVal;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    if (!ok) {
      throw new Error(`Element not found for type: ${primary}`);
    }
  }

  async select(selectorOrId: string | number, value: string): Promise<void> {
    this.assertOpen();
    const { primary, fallback } = this.resolveSelectors(selectorOrId);

    const ok = await this.evaluate<boolean>(`(() => {
      ${FIND_ELEMENT_HELPER}
      const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof el.focus === 'function') el.focus();
      const target = ${JSON.stringify(value)};
      if (el.tagName && el.tagName.toUpperCase() === 'SELECT') {
        let matched = false;
        for (const opt of Array.from(el.options)) {
          if (opt.value === target || (opt.textContent || '').trim() === target) {
            opt.selected = true;
            el.value = opt.value;
            matched = true;
            break;
          }
        }
        if (!matched) {
          el.value = target;
        }
      } else {
        el.value = target;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    if (!ok) {
      throw new Error(`Element not found for select: ${primary}`);
    }
  }

  async press(
    selectorOrId: string | number,
    key: string,
    opts?: { trusted?: boolean },
  ): Promise<void> {
    this.assertOpen();
    const { primary, fallback } = this.resolveSelectors(selectorOrId);

    if (opts?.trusted && this.driver.dispatchKeyPress) {
      const focused = await this.evaluate<boolean>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (typeof el.focus === 'function') el.focus();
        return true;
      })()`);

      if (!focused) {
        throw new Error(`Element not found for press: ${primary}`);
      }
      await this.driver.dispatchKeyPress(this.handle, key);
      return;
    }

    const ok = await this.evaluate<boolean>(`(() => {
      ${FIND_ELEMENT_HELPER}
      const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
      if (!el) return false;
      if (typeof el.focus === 'function') el.focus();
      const keyVal = ${JSON.stringify(key)};
      const eventInit = { key: keyVal, code: keyVal, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
      el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      if (keyVal === 'Enter' && el.form && typeof el.form.requestSubmit === 'function') {
        try { el.form.requestSubmit(); } catch {}
      }
      return true;
    })()`);

    if (!ok) {
      throw new Error(`Element not found for press: ${primary}`);
    }
  }

  async scroll(opts: ScrollOptions = {}): Promise<void> {
    this.assertOpen();
    const dx = opts.x ?? 0;
    const dy = opts.y ?? 500;

    if (opts.selectorOrId !== undefined) {
      const { primary, fallback } = this.resolveSelectors(opts.selectorOrId);
      const ok = await this.evaluate<boolean>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(primary)}, ${JSON.stringify(fallback ?? '')});
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (${dx} !== 0 || ${opts.y !== undefined ? dy : 0} !== 0) {
          if (typeof el.scrollBy === 'function' && el.scrollHeight > el.clientHeight) {
            el.scrollBy(${dx}, ${opts.y ?? 0});
          } else {
            window.scrollBy(${dx}, ${opts.y ?? 0});
          }
        }
        return true;
      })()`);
      if (!ok) {
        throw new Error(`Element not found for scroll: ${primary}`);
      }
      return;
    }

    await this.evaluate<boolean>(`(() => {
      window.scrollBy(${dx}, ${dy});
      return true;
    })()`);
  }

  async waitForSelector(selector: string, opts?: { timeoutMs?: number }): Promise<void> {
    this.assertOpen();
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const start = Date.now();

    while (Date.now() - start <= timeoutMs) {
      const found = await this.evaluate<boolean>(`(() => {
        ${FIND_ELEMENT_HELPER}
        const el = findEl(${JSON.stringify(selector)}, '');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`).catch(() => false);

      if (found) return;
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`Timed out waiting for selector "${selector}" after ${timeoutMs}ms`);
  }

  async waitForNetworkIdle(opts?: WaitForNetworkIdleOptions): Promise<void> {
    this.assertOpen();
    const idleTimeMs = opts?.idleTimeMs ?? 300;
    const timeoutMs = opts?.timeoutMs ?? 5000;
    const start = Date.now();
    this.lastNetworkTimestamp = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (Date.now() - this.lastNetworkTimestamp >= idleTimeMs) {
        return;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  async waitForStable(opts?: WaitForStableOptions): Promise<void> {
    this.assertOpen();
    const quietWindowMs = opts?.quietWindowMs ?? 120;
    const timeoutMs = opts?.timeoutMs ?? 3000;

    await this.evaluate<boolean>(`new Promise((resolve) => {
      const quietMs = ${quietWindowMs};
      const maxMs = ${timeoutMs};
      if (!document.documentElement) {
        resolve(true);
        return;
      }
      let quietTimer = null;
      let maxTimer = null;
      const done = () => {
        if (quietTimer) clearTimeout(quietTimer);
        if (maxTimer) clearTimeout(maxTimer);
        observer.disconnect();
        resolve(true);
      };
      const observer = new MutationObserver(() => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      quietTimer = setTimeout(done, quietMs);
      maxTimer = setTimeout(done, maxMs);
    })`).catch(() => {});
  }

  async evaluate<T>(fnOrExpression: string): Promise<T> {
    this.assertOpen();
    return this.driver.evaluateJson<T>(this.handle, fnOrExpression);
  }

  async observe(opts?: ObserveOptions): Promise<DistilledPage> {
    this.assertOpen();
    const expr = buildDistillerExpression(opts);
    const raw = await this.driver.evaluateJson<RawDistillPayload>(this.handle, expr);
    const distilled = formatDistilledPage(raw, opts);
    this.lastNodes.clear();
    for (const node of distilled.nodes) {
      this.lastNodes.set(node.id, node);
    }
    return distilled;
  }

  async act(instruction: string): Promise<ActionResult> {
    this.assertOpen();
    return this.intentEngine.act(this, instruction);
  }

  async runAgent(goal: string, opts?: AgentLoopOptions): Promise<AgentLoopResult> {
    this.assertOpen();
    return this.intentEngine.runAgent(this, goal, opts);
  }

  async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    this.assertOpen();
    return this.intentEngine.extract(this, instruction, schema);
  }

  async fork(opts?: ForkOptions): Promise<Page> {
    this.assertOpen();
    const state = await this.saveStorageState();

    const { handle, ownsContext } = await this.driver.createPage();
    const branch = new RealmayaPage({
      driver: this.driver,
      handle,
      ownsContext,
      intentEngine: this.intentEngine,
      branchManager: this.branchManager,
      onClosed: (id) => {
        this.branchManager.unregister(id);
        this.onClosed(id);
      },
    });

    this.branchManager.register(branch, opts?.ttlMs ?? 60_000);
    await branch.loadStorageState(state);

    return branch;
  }

  async screenshot(opts?: ScreenshotOptions): Promise<string> {
    this.assertOpen();
    if (opts?.setOfMark) {
      await this.evaluate(buildSetOfMarkExpression());
      try {
        return await this.driver.screenshot(this.handle);
      } finally {
        await this.evaluate(buildRemoveSetOfMarkExpression()).catch(() => {});
      }
    }
    return this.driver.screenshot(this.handle);
  }

  async cookies(): Promise<BrowserCookie[]> {
    this.assertOpen();
    return this.driver.getCookies(this.handle);
  }

  async setCookies(cookies: BrowserCookie[]): Promise<void> {
    this.assertOpen();
    await this.driver.setCookies(this.handle, cookies);
  }

  async saveStorageState(filePath?: string): Promise<StorageState> {
    this.assertOpen();
    const currentUrl = await this.url();
    const currentCookies = await this.cookies();
    const storageSnapshot = await this.evaluate<{
      local: Record<string, string>;
      session: Record<string, string>;
    }>(`(() => {
      const local = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k !== null) local[k] = localStorage.getItem(k) ?? '';
        }
      } catch {}
      const session = {};
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k !== null) session[k] = sessionStorage.getItem(k) ?? '';
        }
      } catch {}
      return { local, session };
    })()`).catch(() => ({ local: {}, session: {} }));

    const state: StorageState = {
      url: currentUrl,
      cookies: currentCookies,
      localStorage: storageSnapshot.local,
      sessionStorage: storageSnapshot.session,
    };

    if (filePath) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
    }

    return state;
  }

  async loadStorageState(filePathOrState: string | StorageState): Promise<void> {
    this.assertOpen();
    const state: StorageState =
      typeof filePathOrState === 'string'
        ? (JSON.parse(await readFile(filePathOrState, 'utf8')) as StorageState)
        : filePathOrState;

    if (state.cookies && state.cookies.length > 0) {
      await this.setCookies(state.cookies).catch(() => {});
    }

    if (state.url && state.url !== 'about:blank') {
      const curUrl = await this.url().catch(() => 'about:blank');
      if (curUrl === 'about:blank' || curUrl !== state.url) {
        await this.goto(state.url, { waitUntil: 'complete' });
      }
    }

    await this.evaluate(
      `(() => {
        const snap = ${JSON.stringify({
          local: state.localStorage ?? {},
          session: state.sessionStorage ?? {},
        })};
        try {
          for (const [k, v] of Object.entries(snap.local)) localStorage.setItem(k, v);
        } catch {}
        try {
          for (const [k, v] of Object.entries(snap.session)) sessionStorage.setItem(k, v);
        } catch {}
        return true;
      })()`,
    ).catch(() => {});
  }

  getNetworkLog(): NetworkExchange[] {
    return [...this.networkLog];
  }

  clearNetworkLog(): void {
    this.networkLog.length = 0;
  }

  async mockRoute(urlSubstring: string, response: MockRouteResponse): Promise<void> {
    this.assertOpen();
    const isJson = typeof response.body !== 'string';
    const bodyText = isJson ? JSON.stringify(response.body) : (response.body as string);
    const contentType =
      response.contentType ?? (isJson ? 'application/json' : 'text/plain;charset=utf-8');
    const normalized: NormalizedMockRoute = {
      urlSubstring,
      status: response.status ?? 200,
      contentType,
      bodyText,
      headers: response.headers ?? {},
    };
    this.mockedRoutes.push(normalized);
    await this.injectMockRoute(normalized);
  }

  private async injectMockRoute(route: NormalizedMockRoute): Promise<void> {
    await this.evaluate<boolean>(`(() => {
      window.__realmaya_mocks__ = window.__realmaya_mocks__ || [];
      window.__realmaya_mocks__.push(${JSON.stringify(route)});
      if (!window.__realmaya_fetch_patched__) {
        window.__realmaya_fetch_patched__ = true;
        const origFetch = window.fetch.bind(window);
        window.fetch = async function(input, init) {
          const reqUrl = typeof input === 'string'
            ? input
            : (input && typeof input.url === 'string')
              ? input.url
              : String(input);
          const mocks = window.__realmaya_mocks__ || [];
          for (let i = mocks.length - 1; i >= 0; i--) {
            const m = mocks[i];
            if (reqUrl.includes(m.urlSubstring)) {
              const headers = new Headers(m.headers || {});
              if (m.contentType && !headers.has('content-type')) {
                headers.set('content-type', m.contentType);
              }
              return new Response(m.bodyText, {
                status: m.status,
                headers
              });
            }
          }
          return origFetch(input, init);
        };

        const OrigXHR = window.XMLHttpRequest;
        if (OrigXHR) {
          const origOpen = OrigXHR.prototype.open;
          const origSend = OrigXHR.prototype.send;
          OrigXHR.prototype.open = function(method, url, ...rest) {
            this.__realmaya_url__ = String(url);
            return origOpen.call(this, method, url, ...rest);
          };
          OrigXHR.prototype.send = function(body) {
            const reqUrl = this.__realmaya_url__ || '';
            const mocks = window.__realmaya_mocks__ || [];
            for (let i = mocks.length - 1; i >= 0; i--) {
              const m = mocks[i];
              if (reqUrl.includes(m.urlSubstring)) {
                Object.defineProperty(this, 'status', { value: m.status, configurable: true });
                Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
                Object.defineProperty(this, 'responseText', { value: m.bodyText, configurable: true });
                Object.defineProperty(this, 'response', { value: m.bodyText, configurable: true });
                setTimeout(() => {
                  if (typeof this.onreadystatechange === 'function') {
                    this.onreadystatechange(new Event('readystatechange'));
                  }
                  if (typeof this.onload === 'function') {
                    this.onload(new ProgressEvent('load'));
                  }
                  this.dispatchEvent(new Event('readystatechange'));
                  this.dispatchEvent(new ProgressEvent('load'));
                }, 0);
                return;
              }
            }
            return origSend.call(this, body);
          };
        }
      }
      return true;
    })()`);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubNetwork?.();
    this.branchManager.unregister(this.id);
    this.onClosed(this.id);
    await this.driver.closePage(this.handle, this.ownsContext);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error(`Page ${this.id} has already been closed`);
    }
  }
}
