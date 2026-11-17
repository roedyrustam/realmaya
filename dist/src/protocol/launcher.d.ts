import { type ChildProcess } from 'node:child_process';
import type { BrowserEngine } from '../types.js';
export interface LaunchedBrowser {
    engine: BrowserEngine;
    wsUrl: string;
    process: ChildProcess;
    userDataDir: string;
    kill: () => Promise<void>;
}
/**
 * Discovers an installed Chrome or Firefox executable on the current OS,
 * honoring explicit paths and `REALMAYA_CHROME_PATH` / `REALMAYA_FIREFOX_PATH`.
 */
export declare function findBrowserExecutable(engine: BrowserEngine, explicitPath?: string): string;
/**
 * Spawns a headless Chrome or Firefox process with remote debugging enabled
 * and resolves with its WebSocket endpoint.
 */
export declare function launchBrowserProcess(engine: BrowserEngine, opts: {
    headless: boolean;
    executablePath?: string;
    args?: string[];
    timeoutMs: number;
}): Promise<LaunchedBrowser>;
//# sourceMappingURL=launcher.d.ts.map