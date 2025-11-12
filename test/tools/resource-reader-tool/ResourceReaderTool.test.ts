// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'pk.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect } from 'vitest';
import { ResourceReaderTool } from '../../../src/tools/resource-reader-tool/ResourceReaderTool.js';

describe('ResourceReaderTool', () => {
  it('returns error for invalid resource URI', async () => {
    const tool = new ResourceReaderTool();
    const result = await tool.run({
      uri: 'mapbox://invalid-resource'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Resource not found');
  });

  it('validates input parameters correctly', () => {
    const tool = new ResourceReaderTool();

    expect(() =>
      tool.inputSchema.parse({ uri: 'mapbox://categories' })
    ).not.toThrow();
    expect(() =>
      tool.inputSchema.parse({ uri: 'mapbox://categories/ja' })
    ).not.toThrow();

    // Invalid: missing URI
    expect(() => tool.inputSchema.parse({})).toThrow();

    // Invalid: empty URI
    expect(() => tool.inputSchema.parse({ uri: '' })).toThrow();
  });

  it('should have output schema defined', () => {
    const tool = new ResourceReaderTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('has correct tool metadata', () => {
    const tool = new ResourceReaderTool();

    expect(tool.name).toBe('resource_reader_tool');
    expect(tool.description).toContain('MCP resource');
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    });
  });
});
