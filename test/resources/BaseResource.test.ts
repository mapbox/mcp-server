// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BaseResource } from '../../src/resources/BaseResource.js';
import { createFakeServer } from '../helpers/fakeMcpServer.js';

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

    const read = (s: ReturnType<typeof createFakeServer>) =>
      s.invokeResource('mapbox://observing');

    it('routes each read to the server that registered its handler', async () => {
      const { a, b } = installedInTwoServers();

      // Installing into b must not redirect the handler registered on a.
      expect(observed(await read(a)).before).toBe('a');
      expect(observed(await read(b)).before).toBe('b');
    });

    it('keeps concurrent reads on separate servers from cross-binding', async () => {
      const { a, b } = installedInTwoServers();

      const [fromA, fromB] = await Promise.all([read(a), read(b)]);

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

  // Covers the templated-URI branch of installTo(), used by
  // mapbox://compute/{spec}, mapbox://inline/{spec} and mapbox://temp/{id}.
  describe('templated URI registration', () => {
    class TemplatedResource extends BaseResource {
      readonly uri = 'mapbox://observing/{id}';
      readonly name = 'templated_observing_resource';
      readonly description = 'Reports its read URI and bound server';
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
                uri,
                before: (before as any)?.id ?? null,
                after: (after as any)?.id ?? null
              })
            }
          ]
        };
      }
    }

    function observed(result: ReadResourceResult) {
      return JSON.parse((result.contents[0] as { text: string }).text);
    }

    it('registers a ResourceTemplate rather than a plain URI string', () => {
      const a = createFakeServer('a');
      new TemplatedResource().installTo(a.server);

      expect(typeof a.resourceArg).not.toBe('string');
      expect(a.resourceArg).toBeInstanceOf(ResourceTemplate);
    });

    it('passes the concrete URI through to read()', async () => {
      const a = createFakeServer('a');
      new TemplatedResource().installTo(a.server);

      const result = await a.invokeResource('mapbox://observing/abc', {
        id: 'abc'
      });

      expect(observed(result).uri).toBe('mapbox://observing/abc');
    });

    it('keeps concurrent templated reads on separate servers from cross-binding', async () => {
      const resource = new TemplatedResource();
      const a = createFakeServer('a');
      const b = createFakeServer('b');
      resource.installTo(a.server);
      resource.installTo(b.server);

      const [fromA, fromB] = await Promise.all([
        a.invokeResource('mapbox://observing/one', { id: 'one' }),
        b.invokeResource('mapbox://observing/two', { id: 'two' })
      ]);

      expect(observed(fromA)).toMatchObject({ before: 'a', after: 'a' });
      expect(observed(fromB)).toMatchObject({ before: 'b', after: 'b' });
    });
  });
});
