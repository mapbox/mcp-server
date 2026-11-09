// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { MapExplorerTool } from '../../../src/tools/map-explorer-tool/MapExplorerTool.js';
import { MAP_APP_URI } from '../../../src/resources/ui-apps/MapAppUIResource.js';

async function listedTool() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  new MapExplorerTool().installTo(server);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const callResult = await client.callTool({
    name: 'map_explorer_tool',
    arguments: {}
  });
  await client.close();
  return { tool: tools[0], callResult };
}

describe('MapExplorerTool', () => {
  it('is an app-only tool on the shared map app, with no sidebar entry of its own', async () => {
    const { tool } = await listedTool();

    expect(tool.name).toBe('map_explorer_tool');
    expect(tool.title).toBe('Mapbox Maps');
    expect(tool._meta).toMatchObject({
      ui: { resourceUri: MAP_APP_URI, visibility: ['app'] }
    });
    // Opened from the Mapbox home entry's quick action instead.
    expect(tool._meta?.['openai/ui']).toBeUndefined();
    expect(tool.icons?.[0]).toMatchObject({
      mimeType: 'image/svg+xml',
      sizes: ['any']
    });
    expect(tool.icons?.[0].src).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('accepts {} and returns an empty, explorer-flagged map payload', async () => {
    const { callResult } = await listedTool();

    expect(callResult.isError).toBeFalsy();
    expect(callResult.structuredContent).toEqual({
      explorer: true,
      mapboxRender: { layers: [], markers: [] }
    });
  });
});
