import { RealmayaBrowser } from './browser/browser.js';
import type { Browser, LaunchOptions } from './types.js';

export type * from './types.js';
export { createOpenAiCompatibleProvider, type OpenAiCompatibleConfig } from './ai/provider.js';
export { McpSamplingProvider } from './ai/mcp-sampling.js';
export { IntentEngine } from './ai/intent-engine.js';
export { LocatorCache } from './semantic/locator-cache.js';
export { buildDistillerExpression, formatDistilledPage } from './semantic/distiller.js';
export { sanitizeUntrustedText, wrapUntrustedDom } from './semantic/firewall.js';
export { RealmayaBrowser } from './browser/browser.js';
export { RealmayaPage } from './browser/page.js';
export { ProtocolError, RpcTransport } from './protocol/bidi-client.js';
export { findBrowserExecutable } from './protocol/launcher.js';

/**
 * Launches a headless Chrome or Firefox browser controlled by `realmaya`.
 */
export async function launch(options?: LaunchOptions): Promise<Browser> {
  return RealmayaBrowser.launch(options);
}

export const realmaya = {
  launch,
};

export default realmaya;
