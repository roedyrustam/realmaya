import type { DistilledPage, ObserveOptions } from '../types.js';
export interface RawDistillPayload {
    url: string;
    title: string;
    nodes: Array<{
        id: number;
        role: string;
        name: string;
        tag: string;
        value?: string;
        placeholder?: string;
        disabled?: boolean;
        fingerprint: string;
        selector: string;
        bbox: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
    }>;
    strippedHiddenNodes: number;
}
/**
 * Generates a self-contained in-page JavaScript expression (<15KB) that extracts
 * an interactive, token-compressed semantic tree and stamps `[data-realmaya-id]`.
 */
export declare function buildDistillerExpression(opts?: ObserveOptions): string;
/**
 * Formats raw distilled DOM nodes into a token-budgeted, `<untrusted_dom>`-wrapped
 * representation for LLM reasoning.
 */
export declare function formatDistilledPage(raw: RawDistillPayload, opts?: ObserveOptions): DistilledPage;
//# sourceMappingURL=distiller.d.ts.map