// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ServerContext } from '@modelcontextprotocol/server';
import { MapboxHomeTool } from '../../../src/tools/mapbox-home-tool/MapboxHomeTool.js';
import type { MapboxHomeOutput } from '../../../src/tools/mapbox-home-tool/MapboxHomeTool.output.schema.js';
import { HOME_APP_URI } from '../../../src/resources/ui-apps/HomeUIResource.js';
import type { HttpRequest } from '../../../src/utils/types.js';
import { structuredOf } from '../../utils/resultTestUtils.js';

/** A secret-token-shaped bearer for account "test-user". */
const secretToken = `sk.${Buffer.from(JSON.stringify({ u: 'test-user' })).toString('base64')}.sig`;
const withToken = (token: string) =>
  ({ http: { authInfo: { token } } }) as unknown as ServerContext;

function json(body: unknown, init: { status?: number; link?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Forbidden',
    headers: new Headers(init.link ? { link: init.link } : {}),
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

const styles = [
  {
    id: 'cjstyle1',
    name: 'Streets copy',
    owner: 'test-user',
    visibility: 'private',
    modified: '2026-10-01T00:00:00.000Z',
    center: [24.9, 60.2],
    zoom: 10
  },
  { name: 'missing id and owner' }
];
const tilesets = [
  {
    id: 'test-user.abc',
    name: 'Parks',
    type: 'vector',
    visibility: 'private',
    filesize: 2048
  }
];
const tokens = [
  {
    id: 'ck1',
    usage: 'pk',
    token: 'pk.default.sig',
    note: 'Default public token',
    default: true,
    scopes: ['styles:tiles']
  },
  { usage: 'sk', token: 'sk.secret.sig', note: 'Secret' },
  { usage: 'pk', token: 'sk.mislabeled.sig' }
];

function routes(
  overrides: Partial<Record<'styles' | 'tilesets' | 'tokens', Response>> = {}
) {
  return vi.fn<HttpRequest>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/styles/v1/'))
      return overrides.styles ?? json(styles);
    if (url.pathname.startsWith('/tilesets/v1/'))
      return overrides.tilesets ?? json(tilesets);
    if (url.pathname.startsWith('/tokens/v2/'))
      return overrides.tokens ?? json(tokens);
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('MapboxHomeTool', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is an app-only ChatGPT sidebar entrypoint on the home UI', () => {
    const tool = new MapboxHomeTool({ httpRequest: routes() });
    expect(tool.meta).toMatchObject({
      ui: { resourceUri: HOME_APP_URI, visibility: ['app'] },
      'openai/ui': { entrypoints: [{ type: 'global' }] }
    });
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it("lists the account's styles, tilesets and public tokens", async () => {
    const httpRequest = routes();
    const result = await new MapboxHomeTool({ httpRequest }).run(
      {},
      withToken(secretToken)
    );

    expect(result.isError).toBe(false);
    const out = structuredOf<MapboxHomeOutput>(result);
    expect(out.home).toBe(true);
    expect(out.username).toBe('test-user');
    expect(out.styles.items).toEqual([
      {
        id: 'cjstyle1',
        name: 'Streets copy',
        owner: 'test-user',
        visibility: 'private',
        created: undefined,
        modified: '2026-10-01T00:00:00.000Z',
        center: [24.9, 60.2],
        zoom: 10
      }
    ]);
    expect(out.tilesets.items[0]).toMatchObject({
      id: 'test-user.abc',
      name: 'Parks',
      filesize: 2048
    });

    const urls = httpRequest.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.pathname).sort()).toEqual([
      '/styles/v1/test-user',
      '/tilesets/v1/test-user',
      '/tokens/v2/test-user'
    ]);
    expect(
      urls
        .find((u) => u.pathname.startsWith('/tokens'))
        ?.searchParams.get('usage')
    ).toBe('pk');
  });

  it('never returns secret tokens, even if the API sends them', async () => {
    const result = await new MapboxHomeTool({ httpRequest: routes() }).run(
      {},
      withToken(secretToken)
    );
    const out = structuredOf<MapboxHomeOutput>(result);
    expect(out.tokens.items.map((t) => t.token)).toEqual(['pk.default.sig']);
    expect(JSON.stringify(result)).not.toContain('sk.secret');
    expect(JSON.stringify(result)).not.toContain('sk.mislabeled');
  });

  it('reports a missing scope per section without failing the others', async () => {
    const result = await new MapboxHomeTool({
      httpRequest: routes({
        tilesets: json(
          { message: 'Not Authorized - No Token' },
          { status: 403 }
        )
      })
    }).run({}, withToken(secretToken));

    expect(result.isError).toBe(false);
    const out = structuredOf<MapboxHomeOutput>(result);
    expect(out.tilesets.items).toEqual([]);
    expect(out.tilesets.error).toContain('tilesets:list');
    expect(out.tilesets.error).not.toContain('..');
    expect(out.styles.items).toHaveLength(1);
  });

  it('flags a section with more pages as truncated', async () => {
    const result = await new MapboxHomeTool({
      httpRequest: routes({
        styles: json(styles, {
          link: '<https://api.mapbox.com/styles/v1/test-user?start=x>; rel="next"'
        })
      })
    }).run({}, withToken(secretToken));

    const out = structuredOf<MapboxHomeOutput>(result);
    expect(out.styles.truncated).toBe(true);
    expect(out.tilesets.truncated).toBeUndefined();
  });

  it('explains when the token has no account name', async () => {
    const httpRequest = routes();
    const result = await new MapboxHomeTool({ httpRequest }).run(
      {},
      withToken('sk.bm90LWpzb24.sig')
    );
    const out = structuredOf<MapboxHomeOutput>(result);
    expect(out.styles.error).toContain('account name');
    expect(httpRequest).not.toHaveBeenCalled();
  });
});
