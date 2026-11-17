import type { z } from 'zod';
import type { IntentEngine } from '../ai/intent-engine.js';
import type { DriverAdapter, PageHandle } from '../protocol/driver-adapter.js';
import type { ActionResult, BrowserCookie, DistilledPage, ForkOptions, NavigateOptions, ObserveOptions, Page } from '../types.js';
import type { BranchManager } from './branch-manager.js';
export declare class RealmayaPage implements Page {
    readonly id: string;
    readonly contextId: string;
    private readonly driver;
    private readonly handle;
    private readonly ownsContext;
    private readonly intentEngine;
    private readonly branchManager;
    private readonly onClosed;
    private closed;
    constructor(params: {
        driver: DriverAdapter;
        handle: PageHandle;
        ownsContext: boolean;
        intentEngine: IntentEngine;
        branchManager: BranchManager;
        onClosed: (pageId: string) => void;
    });
    url(): Promise<string>;
    title(): Promise<string>;
    goto(url: string, opts?: NavigateOptions): Promise<void>;
    click(selectorOrId: string | number): Promise<void>;
    type(selectorOrId: string | number, text: string, opts?: {
        clear?: boolean;
    }): Promise<void>;
    evaluate<T>(fnOrExpression: string): Promise<T>;
    observe(opts?: ObserveOptions): Promise<DistilledPage>;
    act(instruction: string): Promise<ActionResult>;
    extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T>;
    fork(opts?: ForkOptions): Promise<Page>;
    screenshot(): Promise<string>;
    cookies(): Promise<BrowserCookie[]>;
    setCookies(cookies: BrowserCookie[]): Promise<void>;
    close(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
    private assertOpen;
}
//# sourceMappingURL=page.d.ts.map