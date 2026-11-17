import { z } from 'zod';
import type { LocatorCache } from '../semantic/locator-cache.js';
import type { ActionResult, DistilledPage, LlmProvider, Page } from '../types.js';
/**
 * Orchestrates semantic `act()` and `extract()` operations using the
 * Self-Healing Locator Cache first and falling back to the configured `LlmProvider`.
 */
export declare class IntentEngine {
    private readonly cache;
    private readonly llm;
    constructor(cache: LocatorCache, llm?: LlmProvider);
    act(page: Page, instruction: string, observed?: DistilledPage): Promise<ActionResult>;
    extract<T>(page: Page, instruction: string, schema: z.ZodType<T>, observed?: DistilledPage): Promise<T>;
}
//# sourceMappingURL=intent-engine.d.ts.map