import type { BrowserCookie, BrowserEngine, NavigateOptions } from '../types.js';
import type { RpcTransport } from './bidi-client.js';

export interface PageHandle {
  pageId: string;
  contextId: string;
}

/**
 * Unified low-level driver abstraction over WebDriver BiDi (Firefox/BiDi)
 * and CDP (Chrome), keeping `Page` and `Browser` engine-agnostic.
 */
export interface DriverAdapter {
  readonly engine: BrowserEngine;
  initialize(): Promise<void>;
  createPage(isolatedContextId?: string): Promise<{ handle: PageHandle; ownsContext: boolean }>;
  closePage(handle: PageHandle, ownsContext: boolean): Promise<void>;
  navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void>;
  evaluateJson<T>(handle: PageHandle, expression: string): Promise<T>;
  screenshot(handle: PageHandle): Promise<string>;
  getCookies(handle: PageHandle): Promise<BrowserCookie[]>;
  setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void>;
}

/** WebDriver BiDi adapter (native Firefox & BiDi-compliant endpoints). */
export class BidiDriverAdapter implements DriverAdapter {
  readonly engine: BrowserEngine;
  private readonly rpc: RpcTransport;

  constructor(engine: BrowserEngine, rpc: RpcTransport) {
    this.engine = engine;
    this.rpc = rpc;
  }

  async initialize(): Promise<void> {
    await this.rpc.send('session.new', { capabilities: {} });
  }

  async createPage(isolatedContextId?: string): Promise<{ handle: PageHandle; ownsContext: boolean }> {
    let contextId = isolatedContextId;
    let ownsContext = false;

    if (!contextId) {
      const ctx = await this.rpc.send<{ userContext: string }>('browser.createUserContext', {});
      contextId = ctx.userContext;
      ownsContext = true;
    }

    const created = await this.rpc.send<{ context: string }>('browsingContext.create', {
      type: 'tab',
      userContext: contextId,
    });

    return {
      handle: { pageId: created.context, contextId },
      ownsContext,
    };
  }

  async closePage(handle: PageHandle, ownsContext: boolean): Promise<void> {
    await this.rpc.send('browsingContext.close', { context: handle.pageId }).catch(() => {});
    if (ownsContext) {
      await this.rpc
        .send('browser.removeUserContext', { userContext: handle.contextId })
        .catch(() => {});
    }
  }

  async navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void> {
    await this.rpc.send('browsingContext.navigate', {
      context: handle.pageId,
      url,
      wait: opts?.waitUntil ?? 'complete',
    });
  }

  async evaluateJson<T>(handle: PageHandle, expression: string): Promise<T> {
    const wrapped = `JSON.stringify((() => { return (${expression}); })())`;
    const res = await this.rpc.send<{
      result?: { type?: string; value?: string };
      exceptionDetails?: { text?: string };
    }>('script.evaluate', {
      expression: wrapped,
      target: { context: handle.pageId },
      awaitPromise: true,
      resultOwnership: 'none',
    });

    if (res.exceptionDetails) {
      throw new Error(`Page evaluation error: ${res.exceptionDetails.text ?? 'Unknown exception'}`);
    }

    const raw = res.result?.value;
    if (raw === undefined) return undefined as T;
    return JSON.parse(raw) as T;
  }

  async screenshot(handle: PageHandle): Promise<string> {
    const res = await this.rpc.send<{ data: string }>('browsingContext.captureScreenshot', {
      context: handle.pageId,
    });
    return res.data;
  }

  async getCookies(handle: PageHandle): Promise<BrowserCookie[]> {
    const res = await this.rpc.send<{ cookies?: Array<Record<string, unknown>> }>(
      'storage.getCookies',
      { partition: { type: 'context', context: handle.pageId } },
    );
    return (res.cookies ?? []).map((c) => ({
      name: String(c.name ?? ''),
      value: typeof c.value === 'object' && c.value !== null
        ? String((c.value as Record<string, unknown>).value ?? '')
        : String(c.value ?? ''),
      domain: String(c.domain ?? ''),
      ...(c.path ? { path: String(c.path) } : {}),
      ...(typeof c.httpOnly === 'boolean' ? { httpOnly: c.httpOnly } : {}),
      ...(typeof c.secure === 'boolean' ? { secure: c.secure } : {}),
    }));
  }

  async setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void> {
    for (const cookie of cookies) {
      await this.rpc.send('storage.setCookie', {
        cookie: {
          name: cookie.name,
          value: { type: 'string', value: cookie.value },
          domain: cookie.domain,
          path: cookie.path ?? '/',
          httpOnly: cookie.httpOnly ?? false,
          secure: cookie.secure ?? false,
        },
        partition: { type: 'context', context: handle.pageId },
      });
    }
  }
}

/** Chrome DevTools Protocol (CDP) adapter for zero-driver headless Chrome. */
export class CdpDriverAdapter implements DriverAdapter {
  readonly engine: BrowserEngine = 'chrome';
  private readonly rpc: RpcTransport;

  constructor(rpc: RpcTransport) {
    this.rpc = rpc;
  }

  async initialize(): Promise<void> {
    // Browser-level WebSocket is ready immediately upon connect
  }

  async createPage(isolatedContextId?: string): Promise<{ handle: PageHandle; ownsContext: boolean }> {
    let contextId = isolatedContextId;
    let ownsContext = false;

    if (!contextId) {
      const ctx = await this.rpc.send<{ browserContextId: string }>(
        'Target.createBrowserContext',
        {},
      );
      contextId = ctx.browserContextId;
      ownsContext = true;
    }

    const target = await this.rpc.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      browserContextId: contextId,
    });

    const attached = await this.rpc.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });

    const sessionId = attached.sessionId;
    await this.rpc.send('Page.enable', {}, sessionId);
    await this.rpc.send('Runtime.enable', {}, sessionId);

    return {
      handle: { pageId: sessionId, contextId },
      ownsContext,
    };
  }

  async closePage(handle: PageHandle, ownsContext: boolean): Promise<void> {
    await this.rpc.send('Page.close', {}, handle.pageId).catch(() => {});
    if (ownsContext) {
      await this.rpc
        .send('Target.disposeBrowserContext', { browserContextId: handle.contextId })
        .catch(() => {});
    }
  }

  async navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void> {
    const wait = opts?.waitUntil ?? 'complete';
    const loadPromise =
      wait === 'none'
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const eventName = wait === 'interactive' ? 'Page.domContentEventFired' : 'Page.loadEventFired';
            const unsub = this.rpc.on(eventName, () => {
              unsub();
              resolve();
            });
            setTimeout(() => {
              unsub();
              resolve();
            }, 15_000);
          });

    await this.rpc.send('Page.navigate', { url }, handle.pageId);
    await loadPromise;
  }

  async evaluateJson<T>(handle: PageHandle, expression: string): Promise<T> {
    const wrapped = `JSON.stringify((() => { return (${expression}); })())`;
    const res = await this.rpc.send<{
      result?: { value?: unknown };
      exceptionDetails?: { text?: string };
    }>(
      'Runtime.evaluate',
      {
        expression: wrapped,
        awaitPromise: true,
        returnByValue: true,
      },
      handle.pageId,
    );

    if (res.exceptionDetails) {
      throw new Error(`Page evaluation error: ${res.exceptionDetails.text ?? 'Unknown exception'}`);
    }

    const raw = res.result?.value;
    if (typeof raw !== 'string') return undefined as T;
    return JSON.parse(raw) as T;
  }

  async screenshot(handle: PageHandle): Promise<string> {
    const res = await this.rpc.send<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'png' },
      handle.pageId,
    );
    return res.data;
  }

  async getCookies(handle: PageHandle): Promise<BrowserCookie[]> {
    const res = await this.rpc.send<{ cookies?: Array<Record<string, unknown>> }>(
      'Network.getCookies',
      {},
      handle.pageId,
    );
    return (res.cookies ?? []).map((c) => ({
      name: String(c.name ?? ''),
      value: String(c.value ?? ''),
      domain: String(c.domain ?? ''),
      ...(c.path ? { path: String(c.path) } : {}),
      ...(typeof c.httpOnly === 'boolean' ? { httpOnly: c.httpOnly } : {}),
      ...(typeof c.secure === 'boolean' ? { secure: c.secure } : {}),
    }));
  }

  async setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void> {
    if (cookies.length === 0) return;
    await this.rpc.send(
      'Network.setCookies',
      {
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path ?? '/',
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? false,
        })),
      },
      handle.pageId,
    );
  }
}
