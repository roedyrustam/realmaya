import type { z } from 'zod';

/** Supported browser engines orchestrated via WebDriver BiDi / CDP. */
export type BrowserEngine = 'chrome' | 'firefox';

/** Context passed to the destructive-action confirmation guard hook. */
export interface DestructiveActionContext {
  url: string;
  instruction: string;
  action: 'click' | 'type' | 'select' | 'press' | 'scroll';
  node?: SemanticNode;
}

/** Callback invoked before executing a potentially destructive action (e.g. delete, pay, purge). */
export type DestructiveActionGuard = (
  context: DestructiveActionContext,
) => Promise<boolean> | boolean;

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
  /** Optional path to persist the self-healing locator cache (`.json` or `.db`/`.sqlite`). */
  cachePath?: string;
  /** Custom timeout in milliseconds for BiDi/CDP commands. Defaults to `30000`. */
  timeoutMs?: number;
  /** Optional guard hook invoked before destructive actions are executed by `page.act()`. */
  onDestructiveAction?: DestructiveActionGuard;
}

/** Configuration options for connecting to an existing browser WebSocket endpoint. */
export interface ConnectOptions {
  /** WebSocket debugging URL (`ws://...`). */
  wsUrl: string;
  /** Target browser engine. Defaults to `'chrome'`. */
  engine?: BrowserEngine;
  /** Provider-agnostic LLM adapter used by `page.act()` and `page.extract()`. */
  llm?: LlmProvider;
  /** Maximum concurrent speculative branches allowed per browser. Defaults to `10`. */
  maxBranches?: number;
  /** Optional path to persist the self-healing locator cache. */
  cachePath?: string;
  /** Custom timeout in milliseconds for BiDi/CDP commands. Defaults to `30000`. */
  timeoutMs?: number;
  /** Optional guard hook invoked before destructive actions are executed by `page.act()`. */
  onDestructiveAction?: DestructiveActionGuard;
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
  /** Computed ARIA or implicit HTML role (e.g. `button`, `textbox`, `link`, `combobox`). */
  role: string;
  /** Accessible name, trimmed and sanitized. */
  name: string;
  /** Lowercase HTML tag name. */
  tag: string;
  /** Current input/select value, if applicable. */
  value?: string;
  /** Input placeholder, if applicable. */
  placeholder?: string;
  /** Available option labels/values for `<select>` elements. */
  options?: string[];
  /** Whether the control is disabled. */
  disabled?: boolean;
  /** Stable semantic fingerprint used for self-healing locator cache hits. */
  fingerprint: string;
  /** Primary CSS selector targeting `[data-realmaya-id="..."]`. */
  selector: string;
  /** Structural CSS selector fallback if `[data-realmaya-id]` is wiped by a DOM re-render. */
  fallbackSelector?: string;
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
  /** Non-interactive semantic text blocks (headings, paragraphs, table rows) captured in `'full'` mode. */
  contentBlocks?: string[];
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
  /** True when blocked by the destructive-action confirmation guard. */
  blockedByGuard?: boolean;
  reason?: string;
}

/** Options for speculative parallel branching via `page.fork()`. */
export interface ForkOptions {
  /** Time-to-live in milliseconds before the forked context is auto-reaped. Defaults to `60000`. */
  ttlMs?: number;
}

/** Options for capturing a page screenshot, including Set-of-Mark visual grounding. */
export interface ScreenshotOptions {
  /** Render numbered `[id]` Set-of-Mark visual bounding-box overlays before capturing. */
  setOfMark?: boolean;
}

/** Options for scrolling the page or a specific element. */
export interface ScrollOptions {
  /** Horizontal scroll delta in CSS pixels. Defaults to `0`. */
  x?: number;
  /** Vertical scroll delta in CSS pixels. Defaults to `500`. */
  y?: number;
  /** Optional target element ID or CSS selector to scroll into view. */
  selectorOrId?: string | number;
}

/** Captured network exchange entry for HAR-lite inspection and testing. */
export interface NetworkExchange {
  url: string;
  method: string;
  status: number;
  mimeType?: string;
  timestamp: number;
}

/** Deterministic route mock configuration for `page.mockRoute()`. */
export interface MockRouteResponse {
  status?: number;
  contentType?: string;
  body: string | Record<string, unknown>;
  headers?: Record<string, string>;
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
  select(selectorOrId: string | number, value: string): Promise<void>;
  press(selectorOrId: string | number, key: string): Promise<void>;
  scroll(opts?: ScrollOptions): Promise<void>;
  waitForSelector(selector: string, opts?: { timeoutMs?: number }): Promise<void>;
  evaluate<T>(fnOrExpression: string): Promise<T>;
  observe(opts?: ObserveOptions): Promise<DistilledPage>;
  act(instruction: string): Promise<ActionResult>;
  extract<T>(instruction: string, schema: z.ZodType<T>): Promise<T>;
  fork(opts?: ForkOptions): Promise<Page>;
  screenshot(opts?: ScreenshotOptions): Promise<string>;
  cookies(): Promise<BrowserCookie[]>;
  setCookies(cookies: BrowserCookie[]): Promise<void>;
  getNetworkLog(): NetworkExchange[];
  clearNetworkLog(): void;
  mockRoute(urlSubstring: string, response: MockRouteResponse): Promise<void>;
  close(): Promise<void>;
}

/** Portable cookie representation across BiDi/CDP contexts. */
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
