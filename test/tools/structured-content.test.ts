// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapboxApiBasedTool } from '../../src/tools/MapboxApiBasedTool.js';
import type { OutputSchema } from '../../src/tools/MapboxApiBasedTool.schema.js';
import { z } from 'zod';

const TestInputSchema = z.object({
  test: z.string()
});

class TestTool extends MapboxApiBasedTool<typeof TestInputSchema> {
  name = 'test_tool';
  description = 'Test tool for structured content';
  annotations = {
    title: 'Test Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor() {
    super({ inputSchema: TestInputSchema });
  }

  protected async execute(
    input: z.infer<typeof TestInputSchema>,
    _accessToken: string
  ): Promise<z.infer<typeof OutputSchema>> {
    // Return different types based on input
    if (input.test === 'object') {
      const data = {
        message: 'This is structured content',
        data: { value: 42, success: true },
        timestamp: new Date().toISOString()
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: false
      };
    }
    if (input.test === 'content') {
      return {
        content: [{ type: 'text', text: 'This is direct content' }],
        isError: false
      };
    }
    if (input.test === 'complete') {
      // Return complete OutputSchema
      return {
        content: [
          { type: 'text', text: 'Custom content message' },
          { type: 'text', text: 'Additional context' }
        ],
        structuredContent: {
          operation: 'complete_output',
          results: ['item1', 'item2'],
          metadata: { count: 2, status: 'success' }
        },
        isError: false
      };
    }
    return {
      content: [{ type: 'text', text: '"Simple string response"' }],
      isError: false
    };
  }
}

describe('MapboxApiBasedTool Structured Content', () => {
  let tool: TestTool;

  beforeEach(() => {
    tool = new TestTool();
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'pk.test.token');
  });

  it('should return structured content for object responses', async () => {
    const result = await tool.run({ test: 'object' });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toHaveProperty(
      'message',
      'This is structured content'
    );
    expect(result.structuredContent).toHaveProperty('data');
    expect(result.structuredContent?.data).toEqual({
      value: 42,
      success: true
    });
  });

  it('should return direct content without structured content', async () => {
    const result = await tool.run({ test: 'content' });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'This is direct content'
    });
    expect(result.structuredContent).toBeUndefined();
  });

  it('should return simple content for primitive responses', async () => {
    const result = await tool.run({ test: 'string' });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: '"Simple string response"'
    });
    expect(result.structuredContent).toBeUndefined();
  });

  it('should return complete OutputSchema when provided', async () => {
    const result = await tool.run({ test: 'complete' });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Custom content message'
    });
    expect(result.content[1]).toEqual({
      type: 'text',
      text: 'Additional context'
    });
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toEqual({
      operation: 'complete_output',
      results: ['item1', 'item2'],
      metadata: { count: 2, status: 'success' }
    });
  });
});
