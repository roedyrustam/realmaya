const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD]/g;
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Sanitizes untrusted text extracted from a web page by stripping zero-width
 * obfuscation characters, control bytes, and collapsing whitespace.
 */
export function sanitizeUntrustedText(input: string, maxLength = 160): string {
  const cleaned = input
    .replace(ZERO_WIDTH_REGEX, '')
    .replace(CONTROL_CHAR_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 3)}...`;
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
