import type { z } from 'zod';
import type { IntentEngine } from '../ai/intent-engine.js';
import type { DriverAdapter, PageHandle } from '../protocol/driver-adapter.js';
import {
  type RawDistillPayload,
  buildDistillerExpression,
  formatDistilledPage,
} from '../semantic/distiller.js';
import type {
  ActionResult,
  BrowserCookie,
  DistilledPage,
  ForkOptions,
  NavigateOptions,
  ObserveOptions,
  Page,
} from '../types.js';
import type { BranchManager } from './branch-manager.js';

export class RealmayaPage implements Page {
  readonly id: string;
  readonly contextId: string;

  private readonly driver: DriverAdapter;
  private readonly handle: PageHandle;
  private readonly ownsContext: boolean;
  private readonly intentEngine: IntentEngine;
  private readonly branchManager: BranchManager;
  private readonly onClosed: (pageId: string) => void;
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
  }

  async click(selectorOrId: string | number): Promise<void> {
    this.assertOpen();
    const selector =
      typeof selectorOrId === 'number' ? `[data-realmaya-id="${selectorOrId}"]` : selectorOrId;
    const ok = await this.evaluate<boolean>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof el.focus === 'function') el.focus();
      el.click();
      return true;
    })()`);

    if (!ok) {
      throw new Error(`Element not found for click: ${selector}`);
    }
  }

  async type(
    selectorOrId: string | number,
    text: string,
    opts?: { clear?: boolean },
  ): Promise<void> {
    this.assertOpen();
    const selector =
      typeof selectorOrId === 'number' ? `[data-realmaya-id="${selectorOrId}"]` : selectorOrId;
    const clear = opts?.clear ?? false;

    const ok = await this.evaluate<boolean>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
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
      throw new Error(`Element not found for type: ${selector}`);
    }
  }

  async evaluate<T>(fnOrExpression: string): Promise<T> {
    this.assertOpen();
    return this.driver.evaluateJson<T>(this.handle, fnOrExpression);
  }

  async observe(opts?: ObserveOptions): Promise<DistilledPage> {
    this.assertOpen();
    const expr = buildDistillerExpression(opts);
    const raw = await this.driver.evaluateJson<RawDistillPayload>(this.handle, expr);
    return formatDistilledPage(raw, opts);
  }

  async act(instruction: string): Promise<ActionResult> {
    this.assertOpen();
    return this.intentEngine.act(this, instruction);
  }

  async extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T> {
    this.assertOpen();
    return this.intentEngine.extract(this, instruction, schema);
  }

  async fork(opts?: ForkOptions): Promise<Page> {
    this.assertOpen();
    const currentUrl = await this.url();
    const currentCookies = await this.cookies();
    const storageSnapshot = await this.evaluate<{
      local: Record<string, string>;
      session: Record<string, string>;
    }>(`(() => {
      const local = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) local[k] = localStorage.getItem(k) ?? '';
      }
      const session = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k !== null) session[k] = sessionStorage.getItem(k) ?? '';
      }
      return { local, session };
    })()`).catch(() => ({ local: {}, session: {} }));

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

    if (currentCookies.length > 0) {
      await branch.setCookies(currentCookies).catch(() => {});
    }

    if (currentUrl && currentUrl !== 'about:blank') {
      await branch.goto(currentUrl, { waitUntil: 'complete' });
      await branch
        .evaluate(
          `(() => {
            const snap = ${JSON.stringify(storageSnapshot)};
            for (const [k, v] of Object.entries(snap.local)) localStorage.setItem(k, v);
            for (const [k, v] of Object.entries(snap.session)) sessionStorage.setItem(k, v);
            return true;
          })()`,
        )
        .catch(() => {});
    }

    return branch;
  }

  async screenshot(): Promise<string> {
    this.assertOpen();
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

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
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
