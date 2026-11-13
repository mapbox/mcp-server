// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import type { ServerContext } from '@modelcontextprotocol/server';
import { TilesetExplorerTool } from '../../../src/tools/tileset-explorer-tool/TilesetExplorerTool.js';
import type { TilesetExplorerOutput } from '../../../src/tools/tileset-explorer-tool/TilesetExplorerTool.output.schema.js';
import { TILESET_EXPLORER_URI } from '../../../src/resources/ui-apps/TilesetExplorerUIResource.js';
import type { HttpRequest } from '../../../src/utils/types.js';
import { structuredOf, textOf } from '../../utils/resultTestUtils.js';

const secretToken = `sk.${Buffer.from(JSON.stringify({ u: 'test-user' })).toString('base64')}.sig`;
const extra = {
  http: { authInfo: { token: secretToken } }
} as unknown as ServerContext;

function json(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Not Found',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const tileJson = {
  tilejson: '2.2.0',
  name: 'Parks',
  bounds: [24.5, 60.1, 25.3, 60.4],
  center: [24.9, 60.2, 10],
  minzoom: 0,
  maxzoom: 14,
  tiles: [
    `https://a.tiles.mapbox.com/v4/x/{z}/{x}/{y}.mvt?access_token=${secretToken}`
  ],
  vector_layers: [
    {
      id: 'parks',
      description: 'City parks',
      minzoom: 0,
      maxzoom: 14,
      fields: { name: 'String', area: 'Number' }
    },
    { id: 'trails', fields: {} },
    { description: 'no id' }
  ]
};

describe('TilesetExplorerTool', () => {
  it('is a thread entrypoint that opens as a tab', () => {
    const tool = new TilesetExplorerTool({ httpRequest: vi.fn() });
    expect(tool.annotations.title).toBe('Mapbox Tileset Explorer');
    expect(tool.meta).toMatchObject({
      ui: { resourceUri: TILESET_EXPLORER_URI },
      'openai/ui': {
        entrypoints: [{ type: 'thread' }],
        preferredModelDisplayMode: 'fullscreen'
      }
    });
    expect(tool.meta.ui?.visibility).toBeUndefined();
  });

  it("returns a vector tileset's layers and fields, and never its tile URLs", async () => {
    const httpRequest = vi.fn<HttpRequest>(async () => json(tileJson));
    const result = await new TilesetExplorerTool({ httpRequest }).run(
      { tileset_id: 'test-user.parks' },
      extra
    );

    const url = new URL(String(httpRequest.mock.calls[0][0]));
    expect(url.pathname).toBe('/v4/test-user.parks.json');
    expect(url.searchParams.has('secure')).toBe(true);
    expect(url.searchParams.get('access_token')).toBe(secretToken);

    expect(result.isError).toBe(false);
    expect(structuredOf<TilesetExplorerOutput>(result)).toEqual({
      tilesetExplorer: true,
      tileset_id: 'test-user.parks',
      name: 'Parks',
      type: 'vector',
      bounds: [24.5, 60.1, 25.3, 60.4],
      center: [24.9, 60.2, 10],
      minzoom: 0,
      maxzoom: 14,
      layers: [
        {
          id: 'parks',
          description: 'City parks',
          minzoom: 0,
          maxzoom: 14,
          fields: { name: 'String', area: 'Number' }
        },
        { id: 'trails', fields: {} }
      ]
    });
    expect(textOf(result)).toContain('- parks: name, area');
    expect(textOf(result)).toContain('2 source layers');
    expect(JSON.stringify(result)).not.toContain(secretToken);
  });

  it('opens Mapbox Streets when called with no input, as an entrypoint does', async () => {
    const httpRequest = vi.fn<HttpRequest>(async () =>
      json({ name: 'Mapbox Streets v8', vector_layers: [] })
    );
    const result = await new TilesetExplorerTool({ httpRequest }).run(
      {},
      extra
    );
    expect(new URL(String(httpRequest.mock.calls[0][0])).pathname).toBe(
      '/v4/mapbox.mapbox-streets-v8.json'
    );
    expect(structuredOf<TilesetExplorerOutput>(result).tileset_id).toBe(
      'mapbox.mapbox-streets-v8'
    );
  });

  it('reports a tileset without vector layers as raster', async () => {
    const httpRequest = vi.fn<HttpRequest>(async () =>
      json({ name: 'Mapbox Satellite', minzoom: 0, maxzoom: 22 })
    );
    const result = await new TilesetExplorerTool({ httpRequest }).run(
      { tileset_id: 'mapbox.satellite' },
      extra
    );
    const output = structuredOf<TilesetExplorerOutput>(result);
    expect(output.type).toBe('raster');
    expect(output.layers).toEqual([]);
    expect(textOf(result)).toContain('raster, zoom 0 to 22');
  });

  it('accepts several tilesets joined with commas', async () => {
    const httpRequest = vi.fn<HttpRequest>(async () =>
      json({ vector_layers: [] })
    );
    await new TilesetExplorerTool({ httpRequest }).run(
      { tileset_id: 'mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2' },
      extra
    );
    expect(new URL(String(httpRequest.mock.calls[0][0])).pathname).toBe(
      '/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2.json'
    );
  });

  it('rejects an ID that could change the request path', async () => {
    const httpRequest = vi.fn<HttpRequest>();
    for (const tileset_id of ['../tokens/v2/x', 'no-dot', 'a.b/c', 'a.b?x=1']) {
      const result = await new TilesetExplorerTool({ httpRequest }).run(
        { tileset_id },
        extra
      );
      expect(result.isError).toBe(true);
    }
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('explains a tileset that is missing or private', async () => {
    const httpRequest = vi.fn<HttpRequest>(async () =>
      json({ message: 'Tileset does not exist' }, 404)
    );
    const result = await new TilesetExplorerTool({ httpRequest }).run(
      { tileset_id: 'test-user.gone' },
      extra
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(
      "Couldn't load tileset test-user.gone: 404: Tileset does not exist."
    );
    expect(textOf(result)).toContain('private tileset');
  });
});
