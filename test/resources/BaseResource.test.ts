// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseResource } from '../../src/resources/BaseResource.js';

describe('BaseResource', () => {
  describe('server binding', () => {
    // Reports the server it observed at entry and again after an await, so a
    // binding that only holds until the first suspension point is caught.
    class ObservingResource extends BaseResource {
      readonly uri = 'mapbox://observing';
      readonly name = 'observing_resource';
      readonly description = 'Reports which server its read is bound to';
      readonly mimeType = 'application/json';

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

    // Minimal McpServer stand-in that captures the handler installTo
    // registers, and carries an id so a read can be traced to its server.
    function createFakeServer(id: string) {
      let registered: (uri: URL, extra: any) => Promise<ReadResourceResult>;
      const server = {
        id,
        server: {},
        registerResource: (
          _name: string,
          _uri: string,
          _metadata: any,
          handler: any
        ) => {
          registered = handler;
          return {};
        }
      };
      return {
        server: server as any,
        invoke: () => registered(new URL('mapbox://observing'), {})
      };
    }

    function observed(result: ReadResourceResult) {
      return JSON.parse((result.contents[0] as { text: string }).text);
    }

    function installedInTwoServers() {
      const resource = new ObservingResource();
      const a = createFakeServer('a');
      const b = createFakeServer('b');
      resource.installTo(a.server);
      resource.installTo(b.server);
      return { resource, a, b };
    }

    it('routes each read to the server that registered its handler', async () => {
      const { a, b } = installedInTwoServers();

      // Installing into b must not redirect the handler registered on a.
      expect(observed(await a.invoke()).before).toBe('a');
      expect(observed(await b.invoke()).before).toBe('b');
    });

    it('keeps concurrent reads on separate servers from cross-binding', async () => {
      const { a, b } = installedInTwoServers();

      const [fromA, fromB] = await Promise.all([a.invoke(), b.invoke()]);

      expect(observed(fromA)).toEqual({ before: 'a', after: 'a' });
      expect(observed(fromB)).toEqual({ before: 'b', after: 'b' });
    });

    it('falls back to the installed server when read() is called directly', async () => {
      const resource = new ObservingResource();
      const a = createFakeServer('a');
      resource.installTo(a.server);

      // A direct read() has no registered handler to take a binding from.
      expect(observed(await resource.read(resource.uri)).before).toBe('a');
    });
  });
});
