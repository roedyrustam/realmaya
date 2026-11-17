import { RealmayaBrowser } from './browser/browser.js';
import type { Browser, ConnectOptions, LaunchOptions } from './types.js';

export type * from './types.js';
export { createOpenAiCompatibleProvider, type OpenAiCompatibleConfig } from './ai/provider.js';
export { McpSamplingProvider } from './ai/mcp-sampling.js';
export { IntentEngine } from './ai/intent-engine.js';
export { LocatorCache, type CachedLocatorEntry } from './semantic/locator-cache.js';
export {
  buildDistillerExpression,
  buildRemoveSetOfMarkExpression,
  buildSetOfMarkExpression,
  formatDistilledPage,
  type RawDistillPayload,
} from './semantic/distiller.js';
export {
  detectPromptInjectionPatterns,
  isDestructiveIntent,
  sanitizeUntrustedText,
  wrapUntrustedDom,
} from './semantic/firewall.js';
export { RealmayaBrowser } from './browser/browser.js';
export { RealmayaPage } from './browser/page.js';
export { ProtocolError, RpcTransport } from './protocol/bidi-client.js';
export {
  BidiDriverAdapter,
  CdpDriverAdapter,
  type DriverAdapter,
  type PageHandle,
} from './protocol/driver-adapter.js';
export { findBrowserExecutable } from './protocol/launcher.js';

/**
 * Launches a headless Chrome or Firefox browser controlled by `realmaya`.
 */
export async function launch(options?: LaunchOptions): Promise<Browser> {
  return RealmayaBrowser.launch(options);
}

/**
 * Connects `realmaya` to an existing browser WebSocket debugging endpoint (`ws://...`).
 */
export async function connect(options: ConnectOptions): Promise<Browser> {
  return RealmayaBrowser.connect(options);
}

export const realmaya = {
  launch,
  connect,
};

export default realmaya;
