import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import type { LlmProvider } from '../types.js';
/**
 * Bridges `realmaya`'s provider-agnostic `LlmProvider` interface to the MCP host's
 * native `sampling/createMessage` capability, enabling zero-API-key AI execution.
 */
export declare class McpSamplingProvider implements LlmProvider {
    readonly name = "mcp-sampling";
    private readonly mcpServer;
    constructor(mcpServer: McpServer);
    completeJson<T>({ system, prompt, schema, }: {
        system: string;
        prompt: string;
        schema: z.ZodType<T>;
    }): Promise<T>;
}
//# sourceMappingURL=mcp-sampling.d.ts.map