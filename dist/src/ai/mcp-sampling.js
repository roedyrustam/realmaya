import { extractJsonObject } from './provider.js';
/**
 * Bridges `realmaya`'s provider-agnostic `LlmProvider` interface to the MCP host's
 * native `sampling/createMessage` capability, enabling zero-API-key AI execution.
 */
export class McpSamplingProvider {
    name = 'mcp-sampling';
    mcpServer;
    constructor(mcpServer) {
        this.mcpServer = mcpServer;
    }
    async completeJson({ system, prompt, schema, }) {
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
//# sourceMappingURL=mcp-sampling.js.map