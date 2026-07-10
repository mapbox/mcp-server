// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWTs with payload {"u":"testuser"} (base64), prefixed by token type.
const SK_TOKEN = 'sk.eyJ1IjoidGVzdHVzZXIifQ.signature';
const TK_TOKEN = 'tk.eyJ1IjoidGVzdHVzZXIifQ.signature';
const PK_TOKEN = 'pk.eyJ1IjoidGVzdHVzZXIifQ.public';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  resolveMapboxPublicToken,
  __resetMapboxPublicTokenCache
} from '../../src/utils/mapboxPublicToken.js';

const API_ENDPOINT = 'https://api.mapbox.com/';
const DEFAULT_PK = 'pk.eyJ1IjoidGVzdHVzZXIifQ.fake-public-token';

const fakeTokenList = [
  {
    id: 'cktest123',
    usage: 'pk',
    default: true,
    token: DEFAULT_PK,
    scopes: ['styles:read', 'styles:tiles', 'fonts:read']
  }
];

function makeOkJson(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('resolveMapboxPublicToken', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a pk.* access token directly without calling the API', async () => {
    const httpRequest = vi.fn();
    const result = await resolveMapboxPublicToken({
      accessToken: PK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });
    expect(result).toBe(PK_TOKEN);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it('resolves the default public token for a tk.* (OAuth) bearer', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/'))
        return makeOkJson(fakeTokenList) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBe(DEFAULT_PK);
    const call = httpRequest.mock.calls[0][0] as string;
    expect(call).toContain('tokens/v2/testuser');
    expect(call).toContain('default=true');
  });

  it('resolves the default public token for an sk.* bearer (regression)', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/'))
        return makeOkJson(fakeTokenList) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await resolveMapboxPublicToken({
      accessToken: SK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBe(DEFAULT_PK);
  });

  it('falls back to MAPBOX_PUBLIC_TOKEN when the Tokens API responds non-ok', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const httpRequest = vi.fn(
      async () => ({ ok: false, status: 403 }) as Response
    );

    const result = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBe('pk.fallback-token');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Tokens API returned HTTP 403')
    );
  });

  it('returns undefined when no token can be resolved', async () => {
    const httpRequest = vi.fn(
      async () => ({ ok: false, status: 403 }) as Response
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBeUndefined();
  });
});
