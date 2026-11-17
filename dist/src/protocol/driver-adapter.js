/** WebDriver BiDi adapter (native Firefox & BiDi-compliant endpoints). */
export class BidiDriverAdapter {
    engine;
    rpc;
    constructor(engine, rpc) {
        this.engine = engine;
        this.rpc = rpc;
    }
    async initialize() {
        await this.rpc.send('session.new', { capabilities: {} });
    }
    async createPage(isolatedContextId) {
        let contextId = isolatedContextId;
        let ownsContext = false;
        if (!contextId) {
            const ctx = await this.rpc.send('browser.createUserContext', {});
            contextId = ctx.userContext;
            ownsContext = true;
        }
        const created = await this.rpc.send('browsingContext.create', {
            type: 'tab',
            userContext: contextId,
        });
        return {
            handle: { pageId: created.context, contextId },
            ownsContext,
        };
    }
    async closePage(handle, ownsContext) {
        await this.rpc.send('browsingContext.close', { context: handle.pageId }).catch(() => { });
        if (ownsContext) {
            await this.rpc
                .send('browser.removeUserContext', { userContext: handle.contextId })
                .catch(() => { });
        }
    }
    async navigate(handle, url, opts) {
        await this.rpc.send('browsingContext.navigate', {
            context: handle.pageId,
            url,
            wait: opts?.waitUntil ?? 'complete',
        });
    }
    async evaluateJson(handle, expression) {
        const wrapped = `JSON.stringify((() => { return (${expression}); })())`;
        const res = await this.rpc.send('script.evaluate', {
            expression: wrapped,
            target: { context: handle.pageId },
            awaitPromise: true,
            resultOwnership: 'none',
        });
        if (res.exceptionDetails) {
            throw new Error(`Page evaluation error: ${res.exceptionDetails.text ?? 'Unknown exception'}`);
        }
        const raw = res.result?.value;
        if (raw === undefined)
            return undefined;
        return JSON.parse(raw);
    }
    async screenshot(handle) {
        const res = await this.rpc.send('browsingContext.captureScreenshot', {
            context: handle.pageId,
        });
        return res.data;
    }
    async getCookies(handle) {
        const res = await this.rpc.send('storage.getCookies', { partition: { type: 'context', context: handle.pageId } });
        return (res.cookies ?? []).map((c) => ({
            name: String(c.name ?? ''),
            value: typeof c.value === 'object' && c.value !== null
                ? String(c.value.value ?? '')
                : String(c.value ?? ''),
            domain: String(c.domain ?? ''),
            ...(c.path ? { path: String(c.path) } : {}),
            ...(typeof c.httpOnly === 'boolean' ? { httpOnly: c.httpOnly } : {}),
            ...(typeof c.secure === 'boolean' ? { secure: c.secure } : {}),
        }));
    }
    async setCookies(handle, cookies) {
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
export class CdpDriverAdapter {
    engine = 'chrome';
    rpc;
    constructor(rpc) {
        this.rpc = rpc;
    }
    async initialize() {
        // Browser-level WebSocket is ready immediately upon connect
    }
    async createPage(isolatedContextId) {
        let contextId = isolatedContextId;
        let ownsContext = false;
        if (!contextId) {
            const ctx = await this.rpc.send('Target.createBrowserContext', {});
            contextId = ctx.browserContextId;
            ownsContext = true;
        }
        const target = await this.rpc.send('Target.createTarget', {
            url: 'about:blank',
            browserContextId: contextId,
        });
        const attached = await this.rpc.send('Target.attachToTarget', {
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
    async closePage(handle, ownsContext) {
        await this.rpc.send('Page.close', {}, handle.pageId).catch(() => { });
        if (ownsContext) {
            await this.rpc
                .send('Target.disposeBrowserContext', { browserContextId: handle.contextId })
                .catch(() => { });
        }
    }
    async navigate(handle, url, opts) {
        const wait = opts?.waitUntil ?? 'complete';
        const loadPromise = wait === 'none'
            ? Promise.resolve()
            : new Promise((resolve) => {
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
    async evaluateJson(handle, expression) {
        const wrapped = `JSON.stringify((() => { return (${expression}); })())`;
        const res = await this.rpc.send('Runtime.evaluate', {
            expression: wrapped,
            awaitPromise: true,
            returnByValue: true,
        }, handle.pageId);
        if (res.exceptionDetails) {
            throw new Error(`Page evaluation error: ${res.exceptionDetails.text ?? 'Unknown exception'}`);
        }
        const raw = res.result?.value;
        if (typeof raw !== 'string')
            return undefined;
        return JSON.parse(raw);
    }
    async screenshot(handle) {
        const res = await this.rpc.send('Page.captureScreenshot', { format: 'png' }, handle.pageId);
        return res.data;
    }
    async getCookies(handle) {
        const res = await this.rpc.send('Network.getCookies', {}, handle.pageId);
        return (res.cookies ?? []).map((c) => ({
            name: String(c.name ?? ''),
            value: String(c.value ?? ''),
            domain: String(c.domain ?? ''),
            ...(c.path ? { path: String(c.path) } : {}),
            ...(typeof c.httpOnly === 'boolean' ? { httpOnly: c.httpOnly } : {}),
            ...(typeof c.secure === 'boolean' ? { secure: c.secure } : {}),
        }));
    }
    async setCookies(handle, cookies) {
        if (cookies.length === 0)
            return;
        await this.rpc.send('Network.setCookies', {
            cookies: cookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path ?? '/',
                httpOnly: c.httpOnly ?? false,
                secure: c.secure ?? false,
            })),
        }, handle.pageId);
    }
}
//# sourceMappingURL=driver-adapter.js.map