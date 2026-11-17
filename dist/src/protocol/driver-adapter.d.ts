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
    createPage(isolatedContextId?: string): Promise<{
        handle: PageHandle;
        ownsContext: boolean;
    }>;
    closePage(handle: PageHandle, ownsContext: boolean): Promise<void>;
    navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void>;
    evaluateJson<T>(handle: PageHandle, expression: string): Promise<T>;
    screenshot(handle: PageHandle): Promise<string>;
    getCookies(handle: PageHandle): Promise<BrowserCookie[]>;
    setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void>;
}
/** WebDriver BiDi adapter (native Firefox & BiDi-compliant endpoints). */
export declare class BidiDriverAdapter implements DriverAdapter {
    readonly engine: BrowserEngine;
    private readonly rpc;
    constructor(engine: BrowserEngine, rpc: RpcTransport);
    initialize(): Promise<void>;
    createPage(isolatedContextId?: string): Promise<{
        handle: PageHandle;
        ownsContext: boolean;
    }>;
    closePage(handle: PageHandle, ownsContext: boolean): Promise<void>;
    navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void>;
    evaluateJson<T>(handle: PageHandle, expression: string): Promise<T>;
    screenshot(handle: PageHandle): Promise<string>;
    getCookies(handle: PageHandle): Promise<BrowserCookie[]>;
    setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void>;
}
/** Chrome DevTools Protocol (CDP) adapter for zero-driver headless Chrome. */
export declare class CdpDriverAdapter implements DriverAdapter {
    readonly engine: BrowserEngine;
    private readonly rpc;
    constructor(rpc: RpcTransport);
    initialize(): Promise<void>;
    createPage(isolatedContextId?: string): Promise<{
        handle: PageHandle;
        ownsContext: boolean;
    }>;
    closePage(handle: PageHandle, ownsContext: boolean): Promise<void>;
    navigate(handle: PageHandle, url: string, opts?: NavigateOptions): Promise<void>;
    evaluateJson<T>(handle: PageHandle, expression: string): Promise<T>;
    screenshot(handle: PageHandle): Promise<string>;
    getCookies(handle: PageHandle): Promise<BrowserCookie[]>;
    setCookies(handle: PageHandle, cookies: BrowserCookie[]): Promise<void>;
}
//# sourceMappingURL=driver-adapter.d.ts.map