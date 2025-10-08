// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IsochroneTool } from '../../../src/tools/isochrone-tool/IsochroneTool.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock the fetchClient
vi.mock('../../../src/utils/fetchRequest.js', () => ({
  fetchClient: vi.fn()
}));

describe('IsochroneTool Output Schema Registration', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'test-token');

    // Create a mock MCP server
    mockServer = {
      registerTool: vi.fn().mockReturnValue({
        name: 'isochrone_tool',
        description: 'Test tool'
      }),
      server: {
        sendLoggingMessage: vi.fn()
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  it('should register tool with output schema', () => {
    const tool = new IsochroneTool();

    // Install the tool to the mock server
    tool.installTo(mockServer);

    // Verify that registerTool was called
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);

    // Get the call arguments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [name, config, callback] = (mockServer.registerTool as any).mock
      .calls[0];

    // Verify basic tool registration
    expect(name).toBe('isochrone_tool');
    expect(config.title).toBe('Isochrone Tool');
    expect(config.description).toContain('Computes areas that are reachable');
    expect(config.inputSchema).toBeDefined();
    expect(callback).toBeInstanceOf(Function);

    // Verify that outputSchema is registered
    expect(config.outputSchema).toBeDefined();

    // The outputSchema should have the expected structure for FeatureCollection
    expect(config.outputSchema.type).toBeDefined();
    expect(config.outputSchema.features).toBeDefined();
  });

  it('should register output schema as Zod schema objects', () => {
    const tool = new IsochroneTool();
    tool.installTo(mockServer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, config] = (mockServer.registerTool as any).mock.calls[0];
    const outputSchema = config.outputSchema;

    // The outputSchema should be Zod schema objects
    expect(outputSchema.type).toBeDefined();
    expect(outputSchema.type._def).toBeDefined();
    expect(outputSchema.type._def.typeName).toBe('ZodLiteral');
    expect(outputSchema.type._def.value).toBe('FeatureCollection');

    // Features should be a ZodArray
    expect(outputSchema.features).toBeDefined();
    expect(outputSchema.features._def).toBeDefined();
    expect(outputSchema.features._def.typeName).toBe('ZodArray');

    // The MCP server will convert these Zod schemas to JSON Schema for the protocol
    // This validates that we're providing the schemas in the correct format
  });
});
