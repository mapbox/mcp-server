// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { getAllTools } from '../../src/tools/toolRegistry.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Tool Annotations', () => {
  it('should have annotations for all tools', () => {
    const tools = getAllTools();

    tools.forEach((tool) => {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations.title).toBe('string');
      expect(tool.annotations.title).toBeTruthy();
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations.destructiveHint).toBe('boolean');
      expect(typeof tool.annotations.idempotentHint).toBe('boolean');
      expect(typeof tool.annotations.openWorldHint).toBe('boolean');
    });
  });

  it('should properly install tools with annotations to server', () => {
    const server = new McpServer(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    const tools = getAllTools();
    const registeredTools = tools.map((tool) => tool.installTo(server as any));

    // All tools should be registered successfully
    expect(registeredTools).toHaveLength(tools.length);
    registeredTools.forEach((registeredTool) => {
      expect(registeredTool).toBeDefined();
    });
  });

  it('should have appropriate read-only hints for search tools', () => {
    const tools = getAllTools();

    // Search tools should be read-only
    const searchTools = tools.filter(
      (tool) =>
        tool.name.includes('search') ||
        tool.name.includes('geocode') ||
        tool.name.includes('category') ||
        tool.name.includes('version') ||
        tool.name.includes('matrix') ||
        tool.name.includes('directions') ||
        tool.name.includes('isochrone') ||
        tool.name.includes('static_map')
    );

    searchTools.forEach((tool) => {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });
  });

  it('should have open world hints for external API tools', () => {
    const tools = getAllTools();

    // Most Mapbox API tools interact with external services (open world)
    const apiTools = tools.filter((tool) => tool.name !== 'version_tool');

    apiTools.forEach((tool) => {
      expect(tool.annotations.openWorldHint).toBe(true);
    });
  });

  it('should have closed world hint for version tool', () => {
    const tools = getAllTools();
    const versionTool = tools.find((tool) => tool.name === 'version_tool');

    expect(versionTool).toBeDefined();
    expect(versionTool!.annotations.openWorldHint).toBe(false);
  });
});
