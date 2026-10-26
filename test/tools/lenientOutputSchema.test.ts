// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import type {
  CallToolResult,
  ToolAnnotations
} from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { BaseTool } from '../../src/tools/BaseTool.js';

const InputSchema = z.object({ input: z.string() });
const OutputSchema = z.object({
  name: z.string(),
  items: z.array(z.string())
});

/** A tool whose run() returns whatever result the test gives it. */
class FixedResultTool extends BaseTool<
  typeof InputSchema,
  typeof OutputSchema
> {
  readonly name = 'fixed_result_tool';
  readonly description = 'Returns a fixed result';
  readonly annotations: ToolAnnotations = { title: 'Fixed result' };

  constructor(private readonly result: CallToolResult) {
    super({ inputSchema: InputSchema, outputSchema: OutputSchema });
  }

  async run(): Promise<CallToolResult> {
    return this.result;
  }
}

/**
 * Calls the tool through a real McpServer. Uses a raw tools/call request,
 * since the SDK client's callTool() runs its own output-schema check and
 * this is about what the server sends.
 */
async function callThroughServer(result: CallToolResult) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  new FixedResultTool(result).installTo(server);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  const { tools } = await client.listTools();
  const response = (await client.request({
    method: 'tools/call',
    params: { name: 'fixed_result_tool', arguments: { input: 'x' } }
  })) as CallToolResult;
  await client.close();
  return { tools, response };
}

describe('lenient output schema', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the real output schema in tools/list', async () => {
    const { tools } = await callThroughServer({
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { name: 'a', items: [] }
    });
    expect(tools[0].outputSchema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } }
      },
      required: ['name', 'items']
    });
  });

  it('passes mismatched structured content through with a warning, not an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { response } = await callThroughServer({
      content: [{ type: 'text', text: 'Processed' }],
      structuredContent: { name: 'a', items: 'not-an-array' }
    });

    expect(response.isError).toBeFalsy();
    expect(response.structuredContent).toEqual({
      name: 'a',
      items: 'not-an-array'
    });
    expect(response.content).toEqual([{ type: 'text', text: 'Processed' }]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('fixed_result_tool')
    );
  });

  it('keeps a text-only answer instead of failing for missing structured content', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { response } = await callThroughServer({
      content: [{ type: 'text', text: 'Text only' }]
    });

    expect(response.isError).toBeFalsy();
    expect(response.content).toEqual([{ type: 'text', text: 'Text only' }]);
    expect(response.structuredContent).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no structured content')
    );
  });

  it('leaves matching structured content and error results alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await callThroughServer({
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { name: 'a', items: ['b'] }
    });
    expect(ok.response.structuredContent).toEqual({ name: 'a', items: ['b'] });

    const failed = await callThroughServer({
      content: [{ type: 'text', text: 'Upstream failed' }],
      isError: true
    });
    expect(failed.response.isError).toBe(true);
    expect(failed.response.structuredContent).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
