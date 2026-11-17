import { buildDistillerExpression, formatDistilledPage, } from '../semantic/distiller.js';
export class RealmayaPage {
    id;
    contextId;
    driver;
    handle;
    ownsContext;
    intentEngine;
    branchManager;
    onClosed;
    closed = false;
    constructor(params) {
        this.driver = params.driver;
        this.handle = params.handle;
        this.ownsContext = params.ownsContext;
        this.intentEngine = params.intentEngine;
        this.branchManager = params.branchManager;
        this.onClosed = params.onClosed;
        this.id = params.handle.pageId;
        this.contextId = params.handle.contextId;
    }
    async url() {
        return this.evaluate('window.location.href');
    }
    async title() {
        return this.evaluate('document.title');
    }
    async goto(url, opts) {
        this.assertOpen();
        await this.driver.navigate(this.handle, url, opts);
    }
    async click(selectorOrId) {
        this.assertOpen();
        const selector = typeof selectorOrId === 'number' ? `[data-realmaya-id="${selectorOrId}"]` : selectorOrId;
        const ok = await this.evaluate(`(() => {
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
    async type(selectorOrId, text, opts) {
        this.assertOpen();
        const selector = typeof selectorOrId === 'number' ? `[data-realmaya-id="${selectorOrId}"]` : selectorOrId;
        const clear = opts?.clear ?? false;
        const ok = await this.evaluate(`(() => {
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
    async evaluate(fnOrExpression) {
        this.assertOpen();
        return this.driver.evaluateJson(this.handle, fnOrExpression);
    }
    async observe(opts) {
        this.assertOpen();
        const expr = buildDistillerExpression(opts);
        const raw = await this.driver.evaluateJson(this.handle, expr);
        return formatDistilledPage(raw, opts);
    }
    async act(instruction) {
        this.assertOpen();
        return this.intentEngine.act(this, instruction);
    }
    async extract(instruction, schema) {
        this.assertOpen();
        return this.intentEngine.extract(this, instruction, schema);
    }
    async fork(opts) {
        this.assertOpen();
        const currentUrl = await this.url();
        const currentCookies = await this.cookies();
        const storageSnapshot = await this.evaluate(`(() => {
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
            await branch.setCookies(currentCookies).catch(() => { });
        }
        if (currentUrl && currentUrl !== 'about:blank') {
            await branch.goto(currentUrl, { waitUntil: 'complete' });
            await branch
                .evaluate(`(() => {
            const snap = ${JSON.stringify(storageSnapshot)};
            for (const [k, v] of Object.entries(snap.local)) localStorage.setItem(k, v);
            for (const [k, v] of Object.entries(snap.session)) sessionStorage.setItem(k, v);
            return true;
          })()`)
                .catch(() => { });
        }
        return branch;
    }
    async screenshot() {
        this.assertOpen();
        return this.driver.screenshot(this.handle);
    }
    async cookies() {
        this.assertOpen();
        return this.driver.getCookies(this.handle);
    }
    async setCookies(cookies) {
        this.assertOpen();
        await this.driver.setCookies(this.handle, cookies);
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.branchManager.unregister(this.id);
        this.onClosed(this.id);
        await this.driver.closePage(this.handle, this.ownsContext);
    }
    async [Symbol.asyncDispose]() {
        await this.close();
    }
    assertOpen() {
        if (this.closed) {
            throw new Error(`Page ${this.id} has already been closed`);
        }
    }
}
//# sourceMappingURL=page.js.map