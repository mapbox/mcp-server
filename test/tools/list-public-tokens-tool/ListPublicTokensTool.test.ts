// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ServerContext } from '@modelcontextprotocol/server';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import {
  ListPublicTokensTool,
  urlMatches
} from '../../../src/tools/list-public-tokens-tool/ListPublicTokensTool.js';
import type { ListPublicTokensOutput } from '../../../src/tools/list-public-tokens-tool/ListPublicTokensTool.output.schema.js';
import { structuredOf, textOf } from '../../utils/resultTestUtils.js';

/** A secret-token-shaped bearer for account "test-user". */
const secretToken = `sk.${Buffer.from(JSON.stringify({ u: 'test-user' })).toString('base64')}.sig`;
const withToken = (token: string) =>
  ({ http: { authInfo: { token } } }) as unknown as ServerContext;

const defaultPk = {
  usage: 'pk',
  token: 'pk.default.sig',
  note: 'Default public token',
  default: true,
  scopes: ['styles:tiles', 'styles:read'],
  id: 'ckdefault'
};
const restrictedPk = {
  usage: 'pk',
  token: 'pk.restricted.sig',
  note: 'example.com site',
  default: false,
  allowedUrls: ['https://example.com'],
  scopes: ['styles:tiles']
};

function setup(body: unknown, overrides: Partial<Response> = {}) {
  return setupHttpRequest({ json: async () => body, ...overrides });
}

async function run(
  httpRequest: ReturnType<typeof setup>['httpRequest'],
  input: Record<string, unknown> = {},
  token = secretToken
) {
  return new ListPublicTokensTool({ httpRequest }).run(input, withToken(token));
}

describe('ListPublicTokensTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setup([defaultPk]);
    await run(httpRequest);
    assertHeadersSent(mockHttpRequest);
  });

  it("asks for only the account's public tokens", async () => {
    const { httpRequest, mockHttpRequest } = setup([defaultPk]);
    await run(httpRequest);
    const url = new URL(mockHttpRequest.mock.calls[0][0]);
    expect(url.pathname).toBe('/tokens/v2/test-user');
    expect(url.searchParams.get('usage')).toBe('pk');
  });

  it('lists public tokens and recommends the default without a site_url', async () => {
    const { httpRequest } = setup([defaultPk, restrictedPk]);
    const result = await run(httpRequest);

    expect(result.isError).toBe(false);
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.tokens).toEqual([
      {
        token: 'pk.default.sig',
        note: 'Default public token',
        default: true,
        allowedUrls: [],
        scopes: ['styles:tiles', 'styles:read']
      },
      {
        token: 'pk.restricted.sig',
        note: 'example.com site',
        default: false,
        allowedUrls: ['https://example.com'],
        scopes: ['styles:tiles']
      }
    ]);
    expect(output.recommended?.token).toBe('pk.default.sig');
    expect(output.guidance).toContain(
      'account.mapbox.com/access-tokens/create'
    );
    expect(textOf(result)).toContain('Recommended: pk.default.sig');
  });

  it('recommends a token restricted to the site_url', async () => {
    const { httpRequest } = setup([defaultPk, restrictedPk]);
    const result = await run(httpRequest, {
      site_url: 'https://example.com/maps/'
    });
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.recommended?.token).toBe('pk.restricted.sig');
    expect(output.recommended?.reason).toContain('Restricted');
  });

  it('falls back to the default and says why when nothing matches the site_url', async () => {
    const { httpRequest } = setup([defaultPk, restrictedPk]);
    const result = await run(httpRequest, {
      site_url: 'https://other.org'
    });
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.recommended?.token).toBe('pk.default.sig');
    expect(output.recommended?.reason).toContain(
      'No public token is restricted to https://other.org'
    );
  });

  it('never passes through anything but pk tokens', async () => {
    const { httpRequest } = setup([
      defaultPk,
      { usage: 'sk', note: 'secret', default: false, scopes: [] },
      { usage: 'sk', token: 'sk.leak.sig', default: false },
      { usage: 'pk', token: 'tk.wrong-prefix.sig', default: false },
      { usage: 'tk', token: 'tk.temp.sig', default: false }
    ]);
    const result = await run(httpRequest);
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.tokens.map((t) => t.token)).toEqual(['pk.default.sig']);
    expect(JSON.stringify(result)).not.toMatch(/sk\.leak|tk\./);
  });

  it('accepts the object form of the response', async () => {
    const { httpRequest } = setup({ tokens: [defaultPk] });
    const output = structuredOf<ListPublicTokensOutput>(await run(httpRequest));
    expect(output.tokens).toHaveLength(1);
  });

  it('returns a pk access token itself without calling the API', async () => {
    const { httpRequest, mockHttpRequest } = setup([]);
    const pk = `pk.${Buffer.from(JSON.stringify({ u: 'test-user' })).toString('base64')}.sig`;
    const result = await run(httpRequest, {}, pk);
    expect(mockHttpRequest).not.toHaveBeenCalled();
    expect(
      structuredOf<ListPublicTokensOutput>(result).recommended?.token
    ).toBe(pk);
  });

  it('explains the missing scope on a 403', async () => {
    const { httpRequest } = setup(
      {},
      {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () =>
          JSON.stringify({ message: 'Not Authorized - No Token' })
      }
    );
    const result = await run(httpRequest);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('tokens:read');
  });

  it('falls back to MAPBOX_PUBLIC_TOKEN when listing fails on the server token', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', secretToken);
    vi.stubEnv('MAPBOX_PUBLIC_TOKEN', 'pk.env.sig');
    const { httpRequest } = setup(
      {},
      {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{}'
      }
    );
    const result = await run(httpRequest);
    expect(result.isError).toBe(false);
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.recommended?.token).toBe('pk.env.sig');
    expect(output.recommended?.reason).toContain('tokens:read');
  });

  it("never hands a hosted caller the server's MAPBOX_PUBLIC_TOKEN", async () => {
    vi.stubEnv('MAPBOX_PUBLIC_TOKEN', 'pk.env.sig');
    const { httpRequest } = setup(
      {},
      {
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '{}'
      }
    );
    // The caller's bearer token differs from the server's MAPBOX_ACCESS_TOKEN.
    const result = await run(httpRequest);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('pk.env.sig');
  });

  it("doesn't recommend a token restricted to another site", async () => {
    const { httpRequest } = setup([restrictedPk]);
    const result = await run(httpRequest, { site_url: 'https://other.org' });
    const output = structuredOf<ListPublicTokensOutput>(result);
    expect(output.tokens).toHaveLength(1);
    expect(output.recommended).toBe(undefined);
    expect(textOf(result)).toContain('restricted to other URLs');
  });

  it('falls back to an unrestricted token when there is no default', async () => {
    const plainPk = { ...defaultPk, token: 'pk.plain.sig', default: false };
    const { httpRequest } = setup([restrictedPk, plainPk]);
    const output = structuredOf<ListPublicTokensOutput>(await run(httpRequest));
    expect(output.recommended?.token).toBe('pk.plain.sig');
  });

  it('says so when the account has no public tokens', async () => {
    const { httpRequest } = setup([]);
    const result = await run(httpRequest);
    expect(structuredOf<ListPublicTokensOutput>(result).recommended).toBe(
      undefined
    );
    expect(textOf(result)).toContain('no public tokens');
  });
});

describe('urlMatches', () => {
  it.each([
    ['https://example.com', 'https://example.com', true],
    ['https://example.com', 'http://EXAMPLE.com/', true],
    ['https://example.com', 'https://example.com/maps/page', true],
    ['https://example.com/maps', 'https://example.com/maps/page', true],
    ['https://example.com/maps', 'https://example.com/other', false],
    ['https://example.com', 'https://example.com.evil.org', false],
    ['https://example.com', 'https://notexample.com', false],
    ['*.example.com', 'https://docs.example.com/x', true],
    ['*.example.com', 'https://example.org', false],
    ['http://localhost:3000', 'http://localhost:3000/index.html', true],
    ['http://localhost:3000', 'http://localhost:4000', false]
  ])('%s allows %s: %s', (allowed, site, expected) => {
    expect(urlMatches(allowed, site)).toBe(expected);
  });
});
