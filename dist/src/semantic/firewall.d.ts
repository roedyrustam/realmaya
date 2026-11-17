/**
 * Sanitizes untrusted text extracted from a web page by stripping zero-width
 * obfuscation characters, control bytes, and collapsing whitespace.
 */
export declare function sanitizeUntrustedText(input: string, maxLength?: number): string;
/**
 * Wraps distilled page content in explicit `<untrusted_dom>` delimiters so
 * downstream LLMs treat web content strictly as data, never as instructions.
 */
export declare function wrapUntrustedDom(url: string, title: string, treeBody: string): string;
//# sourceMappingURL=firewall.d.ts.map