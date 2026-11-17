const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD]/g;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const DELIMITER_BREAKOUT_REGEX = /<\/?untrusted_dom[^>]*>/gi;

const PROMPT_INJECTION_REGEX =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|system\s+prompt\s*:|you\s+are\s+now\s+in\s+developer\s+mode|<\s*\|\s*im_(?:start|end)\s*\|\s*>)/i;

const DESTRUCTIVE_INTENT_REGEX =
  /\b(delete|remove|destroy|purge|drop|cancel subscription|close account|transfer funds|pay now|confirm payment|wipe)\b/i;

/**
 * Sanitizes untrusted text extracted from a web page by stripping zero-width
 * obfuscation characters, control bytes, `<untrusted_dom>` breakout tags, and
 * collapsing whitespace.
 */
export function sanitizeUntrustedText(input: string, maxLength = 160): string {
  const cleaned = input
    .replace(ZERO_WIDTH_REGEX, '')
    .replace(CONTROL_CHAR_REGEX, '')
    .replace(DELIMITER_BREAKOUT_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 3)}...`;
}

/**
 * Detects obvious prompt-injection override phrases embedded inside untrusted DOM nodes.
 */
export function detectPromptInjectionPatterns(text: string): boolean {
  return PROMPT_INJECTION_REGEX.test(text);
}

/**
 * Checks whether an instruction or target node label involves potentially destructive operations.
 */
export function isDestructiveIntent(instruction: string, nodeName?: string): boolean {
  if (DESTRUCTIVE_INTENT_REGEX.test(instruction)) {
    return true;
  }
  if (nodeName && DESTRUCTIVE_INTENT_REGEX.test(nodeName)) {
    return true;
  }
  return false;
}

/**
 * Wraps distilled page content in explicit `<untrusted_dom>` delimiters so
 * downstream LLMs treat web content strictly as data, never as instructions.
 */
export function wrapUntrustedDom(url: string, title: string, treeBody: string): string {
  const safeUrl = sanitizeUntrustedText(url, 300);
  const safeTitle = sanitizeUntrustedText(title, 140);
  return [
    '<untrusted_dom>',
    `URL: ${safeUrl}`,
    `TITLE: ${safeTitle}`,
    '---',
    treeBody,
    '</untrusted_dom>',
  ].join('\n');
}
