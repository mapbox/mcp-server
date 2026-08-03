// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'pk.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { ResourceReaderTool } from '../../../src/tools/resource-reader-tool/ResourceReaderTool.js';
import { BaseResource } from '../../../src/resources/BaseResource.js';
import { createFakeServer } from '../../helpers/fakeMcpServer.js';

// vi.mock factories hoist above the imports, so the resource under test has to
// live in a hoisted holder the factory can close over.
const h = vi.hoisted(() => ({ resource: null as any }));

// The tool reaches the registry two ways — a static import of getResourceByUri
// and a dynamic import of getAllResources on the error path. This covers both.
vi.mock('../../../src/resources/resourceRegistry.js', () => ({
  getResourceByUri: (uri: string) => {
    const resource = h.resource;
    if (!resource) {
      return undefined;
    }
    const prefix = resource.uri.split('{')[0];
    return uri.startsWith(prefix) ? resource : undefined;
  },
  getAllResources: () => (h.resource ? [h.resource] : [])
}));

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

  describe('server binding of the nested resource read', () => {
    // Reports its bound server before and after an await, so a binding that
    // only holds until the first suspension point is caught.
    class ObservingResource extends BaseResource {
      readonly name = 'observing_resource';
      readonly description = 'Reports which server its read is bound to';
      readonly mimeType = 'application/json';

      constructor(readonly uri: string) {
        super();
      }

      async read(uri: string): Promise<ReadResourceResult> {
        const before = this.activeServer;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const after = this.activeServer;
        return {
          contents: [
            {
              uri,
              mimeType: this.mimeType,
              text: JSON.stringify({
                before: (before as any)?.id ?? null,
                after: (after as any)?.id ?? null
              })
            }
          ]
        };
      }
    }

    function observed(result: { content: unknown[] }) {
      return JSON.parse((result.content[0] as { text: string }).text);
    }

    beforeEach(() => {
      h.resource = null;
    });

    // The tool calls read() on a registry instance directly, bypassing that
    // resource's own installTo() wrapper.
    async function readThroughTool(resourceUri: string, readUri: string) {
      h.resource = new ObservingResource(resourceUri);
      const tool = new ResourceReaderTool();
      const a = createFakeServer('a');
      const b = createFakeServer('b');

      // The resource knows only about b; the tool call arrives through a.
      h.resource.installTo(b.server);
      tool.installTo(a.server);

      return observed(await a.invokeTool({ uri: readUri }));
    }

    it('binds the read to the server that received the tool call', async () => {
      expect(
        await readThroughTool('mapbox://observing', 'mapbox://observing')
      ).toEqual({ before: 'a', after: 'a' });
    });

    it('binds the read for a templated resource URI too', async () => {
      expect(
        await readThroughTool(
          'mapbox://observing/{id}',
          'mapbox://observing/abc'
        )
      ).toEqual({ before: 'a', after: 'a' });
    });
  });
});
