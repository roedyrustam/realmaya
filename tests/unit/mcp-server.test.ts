import { describe, expect, it } from 'vitest';
import { extractJsonObject } from '../../src/ai/provider.js';
import { createRealmayaMcpServer } from '../../src/mcp/server.js';

describe('MCP Server & JSON Extractor', () => {
  it('extracts JSON from fenced markdown blocks', () => {
    const parsed = extractJsonObject('```json\n{"action":"click","nodeId":2}\n```');
    expect(parsed).toEqual({ action: 'click', nodeId: 2 });
  });

  it('creates an MCP server instance with session registry', () => {
    const { server, session } = createRealmayaMcpServer();
    expect(server).toBeDefined();
    expect(session).toBeDefined();
  });
});
