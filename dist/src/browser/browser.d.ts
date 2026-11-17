import type { Browser, BrowserEngine, LaunchOptions, Page } from '../types.js';
export declare class RealmayaBrowser implements Browser {
    readonly engine: BrowserEngine;
    private readonly transport;
    private readonly driver;
    private readonly launched;
    private readonly cache;
    private readonly intentEngine;
    private readonly branchManager;
    private readonly openPages;
    private closed;
    private constructor();
    static launch(opts?: LaunchOptions): Promise<RealmayaBrowser>;
    newPage(): Promise<Page>;
    pages(): Page[];
    clearAllData(): Promise<void>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
}
//# sourceMappingURL=browser.d.ts.map