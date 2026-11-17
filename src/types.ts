import type { z } from 'zod';

/** Supported browser engines orchestrated via WebDriver BiDi. */
export type BrowserEngine = 'chrome' | 'firefox';

/** Configuration options for launching a headless browser instance. */
export interface LaunchOptions {
  /** Target browser engine. Defaults to `'chrome'`. */
  engine?: BrowserEngine;
  /** Run in headless mode without visible UI. Defaults to `true`. */
  headless?: boolean;
  /** Explicit path to the browser executable. Auto-discovered when omitted. */
  executablePath?: string;
  /** Additional CLI flags passed to the browser process. */
  args?: string[];
  /** Provider-agnostic LLM adapter used by `page.act()` and `page.extract()`. */
  llm?: LlmProvider;
  /** Maximum concurrent speculative branches allowed per browser. Defaults to `10`. */
  maxBranches?: number;
  /** Optional path to persist the self-healing locator cache. */
  cachePath?: string;
  /** Custom timeout in milliseconds for BiDi commands. Defaults to `30000`. */
  timeoutMs?: number;
}

/** Bounding box of a distilled interactive element in CSS pixels. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compact representation of an interactive DOM element produced by the Semantic Distiller. */
export interface SemanticNode {
  /** Ephemeral numeric ID assigned for the current observation snapshot (`1..N`). */
  id: number;
  /** Computed ARIA or implicit HTML role (e.g. `button`, `textbox`, `link`). */
  role: string;
  /** Accessible name, trimmed and sanitized. */
  name: string;
  /** Lowercase HTML tag name. */
  tag: string;
  /** Current input value, if applicable. */
  value?: string;
  /** Input placeholder, if applicable. */
  placeholder?: string;
  /** Whether the control is disabled. */
  disabled?: boolean;
  /** Stable semantic fingerprint used for self-healing locator cache hits. */
  fingerprint: string;
  /** CSS selector fallback generated deterministically for BiDi targeting. */
  selector: string;
  /** Viewport-relative bounding box. */
  bbox: BoundingBox;
}

/** Token-compressed page observation returned by `page.observe()`. */
export interface DistilledPage {
  url: string;
  title: string;
  /** Approximate token count of `treeText`. */
  tokenEstimate: number;
  /** Sanitized, `<untrusted_dom>`-wrapped semantic tree text for LLM consumption. */
  treeText: string;
  /** Structured interactive nodes indexed by `id`. */
  nodes: SemanticNode[];
  /** Number of hidden/invisible nodes stripped by the Prompt-Injection Firewall. */
  strippedHiddenNodes: number;
}

/** Options controlling Semantic Distiller compression and token budget. */
export interface ObserveOptions {
  /** Filtering mode: `'interactive'` (default), `'viewport'`, or `'full'`. */
  mode?: 'interactive' | 'viewport' | 'full';
  /** Hard token budget ceiling for `treeText`. Defaults to `1500`. */
  maxTokens?: number;
}

/** Result of an intent-driven `page.act()` execution. */
export interface ActionResult {
  ok: boolean;
  action: 'click' | 'type' | 'select' | 'press' | 'scroll' | 'noop';
  nodeId?: number;
  /** True when resolved from the self-healing locator cache with 0 LLM tokens. */
  cached: boolean;
  reason?: string;
}

/** Options for speculative parallel branching via `page.fork()`. */
export interface ForkOptions {
  /** Time-to-live in milliseconds before the forked context is auto-reaped. Defaults to `60000`. */
  ttlMs?: number;
}

/** Provider-agnostic LLM interface supporting BYOK and MCP Sampling. */
export interface LlmProvider {
  readonly name: string;
  completeJson<T>(params: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
}

/** Navigation options for `page.goto()`. */
export interface NavigateOptions {
  waitUntil?: 'none' | 'interactive' | 'complete';
}

/** High-level page controller with semantic AI, self-healing, and speculative forking. */
export interface Page extends AsyncDisposable {
  readonly id: string;
  readonly contextId: string;
  url(): Promise<string>;
  title(): Promise<string>;
  goto(url: string, opts?: NavigateOptions): Promise<void>;
  click(selectorOrId: string | number): Promise<void>;
  type(selectorOrId: string | number, text: string, opts?: { clear?: boolean }): Promise<void>;
  evaluate<T>(fnOrExpression: string): Promise<T>;
  observe(opts?: ObserveOptions): Promise<DistilledPage>;
  act(instruction: string): Promise<ActionResult>;
  extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T>;
  fork(opts?: ForkOptions): Promise<Page>;
  screenshot(): Promise<string>;
  cookies(): Promise<BrowserCookie[]>;
  setCookies(cookies: BrowserCookie[]): Promise<void>;
  close(): Promise<void>;
}

/** Portable cookie representation across BiDi contexts. */
export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  expiry?: number;
}

/** High-level browser controller managing contexts and lifecycle. */
export interface Browser extends AsyncDisposable {
  readonly engine: BrowserEngine;
  newPage(): Promise<Page>;
  pages(): Page[];
  clearAllData(): Promise<void>;
  close(): Promise<void>;
}
