import { IntentEngine } from '../ai/intent-engine.js';
import { RpcTransport } from '../protocol/bidi-client.js';
import { getDaemonStatus } from '../protocol/daemon.js';
import {
  BidiDriverAdapter,
  CdpDriverAdapter,
  type DriverAdapter,
} from '../protocol/driver-adapter.js';
import { type LaunchedBrowser, launchBrowserProcess } from '../protocol/launcher.js';
import { LocatorCache } from '../semantic/locator-cache.js';
import type { Browser, BrowserEngine, ConnectOptions, LaunchOptions, Page } from '../types.js';
import { BranchManager } from './branch-manager.js';
import { RealmayaPage } from './page.js';

export class RealmayaBrowser implements Browser {
  readonly engine: BrowserEngine;

  private readonly transport: RpcTransport;
  private readonly driver: DriverAdapter;
  private readonly launched: LaunchedBrowser | undefined;
  private readonly cache: LocatorCache;
  private readonly intentEngine: IntentEngine;
  private readonly branchManager: BranchManager;
  private readonly openPages = new Map<string, Page>();
  private closed = false;

  private constructor(params: {
    engine: BrowserEngine;
    transport: RpcTransport;
    driver: DriverAdapter;
    launched?: LaunchedBrowser;
    cache: LocatorCache;
    intentEngine: IntentEngine;
    branchManager: BranchManager;
  }) {
    this.engine = params.engine;
    this.transport = params.transport;
    this.driver = params.driver;
    this.launched = params.launched;
    this.cache = params.cache;
    this.intentEngine = params.intentEngine;
    this.branchManager = params.branchManager;
  }

  static async launch(opts: LaunchOptions = {}): Promise<RealmayaBrowser> {
    const engine: BrowserEngine = opts.engine ?? 'chrome';

    if (opts.reuseDaemon) {
      const daemon = await getDaemonStatus(engine);
      if (daemon) {
        return RealmayaBrowser.connect({
          wsUrl: daemon.wsUrl,
          engine,
          ...(opts.llm ? { llm: opts.llm } : {}),
          ...(opts.maxBranches !== undefined ? { maxBranches: opts.maxBranches } : {}),
          ...(opts.cachePath ? { cachePath: opts.cachePath } : {}),
          ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
          ...(opts.onDestructiveAction ? { onDestructiveAction: opts.onDestructiveAction } : {}),
        });
      }
    }

    const timeoutMs = opts.timeoutMs ?? 30_000;
    const launched = await launchBrowserProcess(engine, {
      headless: opts.headless ?? true,
      ...(opts.executablePath ? { executablePath: opts.executablePath } : {}),
      ...(opts.args ? { args: opts.args } : {}),
      timeoutMs,
    });

    const transport = new RpcTransport(timeoutMs);
    try {
      await transport.connect(launched.wsUrl);
      const driver: DriverAdapter =
        engine === 'firefox'
          ? new BidiDriverAdapter(engine, transport)
          : new CdpDriverAdapter(transport);
      await driver.initialize();

      const cache = new LocatorCache(opts.cachePath);
      const intentEngine = new IntentEngine(cache, opts.llm, opts.onDestructiveAction);
      const branchManager = new BranchManager(opts.maxBranches ?? 10);

      return new RealmayaBrowser({
        engine,
        transport,
        driver,
        launched,
        cache,
        intentEngine,
        branchManager,
      });
    } catch (err) {
      await transport.close().catch(() => {});
      await launched.kill().catch(() => {});
      throw err;
    }
  }

  static async connect(opts: ConnectOptions): Promise<RealmayaBrowser> {
    const engine: BrowserEngine = opts.engine ?? 'chrome';
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const transport = new RpcTransport(timeoutMs);
    try {
      await transport.connect(opts.wsUrl);
      const driver: DriverAdapter =
        engine === 'firefox'
          ? new BidiDriverAdapter(engine, transport)
          : new CdpDriverAdapter(transport);
      await driver.initialize();

      const cache = new LocatorCache(opts.cachePath);
      const intentEngine = new IntentEngine(cache, opts.llm, opts.onDestructiveAction);
      const branchManager = new BranchManager(opts.maxBranches ?? 10);

      return new RealmayaBrowser({
        engine,
        transport,
        driver,
        cache,
        intentEngine,
        branchManager,
      });
    } catch (err) {
      await transport.close().catch(() => {});
      throw err;
    }
  }

  async newPage(): Promise<Page> {
    if (this.closed) {
      throw new Error('Browser has already been closed');
    }
    const { handle, ownsContext } = await this.driver.createPage();
    const page = new RealmayaPage({
      driver: this.driver,
      handle,
      ownsContext,
      intentEngine: this.intentEngine,
      branchManager: this.branchManager,
      onClosed: (id) => {
        this.openPages.delete(id);
      },
    });
    this.openPages.set(page.id, page);
    return page;
  }

  pages(): Page[] {
    return Array.from(this.openPages.values());
  }

  async clearAllData(): Promise<void> {
    await this.cache.purge();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.branchManager.closeAll();
    const pages = Array.from(this.openPages.values());
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
    this.openPages.clear();
    await this.transport.close().catch(() => {});
    await this.launched?.kill().catch(() => {});
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
