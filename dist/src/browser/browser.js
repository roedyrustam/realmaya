import { IntentEngine } from '../ai/intent-engine.js';
import { RpcTransport } from '../protocol/bidi-client.js';
import { BidiDriverAdapter, CdpDriverAdapter } from '../protocol/driver-adapter.js';
import { launchBrowserProcess } from '../protocol/launcher.js';
import { LocatorCache } from '../semantic/locator-cache.js';
import { BranchManager } from './branch-manager.js';
import { RealmayaPage } from './page.js';
export class RealmayaBrowser {
    engine;
    transport;
    driver;
    launched;
    cache;
    intentEngine;
    branchManager;
    openPages = new Map();
    closed = false;
    constructor(params) {
        this.engine = params.engine;
        this.transport = params.transport;
        this.driver = params.driver;
        this.launched = params.launched;
        this.cache = params.cache;
        this.intentEngine = params.intentEngine;
        this.branchManager = params.branchManager;
    }
    static async launch(opts = {}) {
        const engine = opts.engine ?? 'chrome';
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
            const driver = engine === 'firefox'
                ? new BidiDriverAdapter(engine, transport)
                : new CdpDriverAdapter(transport);
            await driver.initialize();
            const cache = new LocatorCache(opts.cachePath);
            const intentEngine = new IntentEngine(cache, opts.llm);
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
        }
        catch (err) {
            await transport.close().catch(() => { });
            await launched.kill().catch(() => { });
            throw err;
        }
    }
    async newPage() {
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
    pages() {
        return Array.from(this.openPages.values());
    }
    async clearAllData() {
        await this.cache.purge();
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        await this.branchManager.closeAll();
        const pages = Array.from(this.openPages.values());
        await Promise.all(pages.map((p) => p.close().catch(() => { })));
        this.openPages.clear();
        await this.transport.close().catch(() => { });
        await this.launched.kill().catch(() => { });
    }
    async [Symbol.asyncDispose]() {
        await this.close();
    }
}
//# sourceMappingURL=browser.js.map