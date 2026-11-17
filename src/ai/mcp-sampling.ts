import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import type { LlmProvider } from '../types.js';
import { extractJsonObject } from './provider.js';

/**
 * Bridges `realmaya`'s provider-agnostic `LlmProvider` interface to the MCP host's
 * native `sampling/createMessage` capability, enabling zero-API-key AI execution.
 */
export class McpSamplingProvider implements LlmProvider {
  readonly name = 'mcp-sampling';
  private readonly mcpServer: McpServer;

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
  }

  async completeJson<T>({
    system,
    prompt,
    schema,
  }: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const result = await this.mcpServer.server.createMessage({
      systemPrompt: `${system}\nRespond ONLY with valid JSON.`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompt,
          },
        },
      ],
      maxTokens: 1024,
      temperature: 0,
    });

    const content = result.content;
    if (content.type !== 'text') {
      throw new Error(`MCP sampling returned unsupported content type: ${content.type}`);
    }

    const parsed = extractJsonObject(content.text);
    return schema.parse(parsed);
  }
}
