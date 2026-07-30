// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWTs with payload {"u":"testuser"} (base64), prefixed by token type.
const SK_TOKEN = 'sk.eyJ1IjoidGVzdHVzZXIifQ.signature';
const TK_TOKEN = 'tk.eyJ1IjoidGVzdHVzZXIifQ.signature';
const PK_TOKEN = 'pk.eyJ1IjoidGVzdHVzZXIifQ.public';
// A second, distinct user (payload {"u":"otheruser"}) used to prove the
// public-token cache never crosses accounts.
const OTHER_USER_TK_TOKEN = 'tk.eyJ1Ijoib3RoZXJ1c2VyIn0.signature';

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

  it('falls back to MAPBOX_PUBLIC_TOKEN without warning on 401/403 (missing tokens:read scope is expected)', async () => {
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
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and falls back to MAPBOX_PUBLIC_TOKEN on an unexpected non-ok status', async () => {
    process.env.MAPBOX_PUBLIC_TOKEN = 'pk.fallback-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const httpRequest = vi.fn(
      async () => ({ ok: false, status: 500 }) as Response
    );

    const result = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBe('pk.fallback-token');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Tokens API returned unexpected HTTP 500')
    );
  });

  it('returns undefined when no token can be resolved', async () => {
    const httpRequest = vi.fn(
      async () => ({ ok: false, status: 403 }) as Response
    );

    const result = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(result).toBeUndefined();
  });

  it('caches the resolved token per-user and skips a second API call for the same user', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/'))
        return makeOkJson(fakeTokenList) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const first = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });
    const second = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(first).toBe(DEFAULT_PK);
    expect(second).toBe(DEFAULT_PK);
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it("never returns one user's cached token to a different user (cross-tenant isolation)", async () => {
    const otherUserPk = 'pk.eyJ1Ijoib3RoZXJ1c2VyIn0.other-users-token';
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/testuser'))
        return makeOkJson(fakeTokenList) as Response;
      if (url.includes('tokens/v2/otheruser'))
        return makeOkJson([
          { id: 'ckother', usage: 'pk', default: true, token: otherUserPk }
        ]) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const forTestUser = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });
    const forOtherUser = await resolveMapboxPublicToken({
      accessToken: OTHER_USER_TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });
    // Re-resolve for the original user to confirm it still gets its own
    // cached token rather than the other user's.
    const forTestUserAgain = await resolveMapboxPublicToken({
      accessToken: TK_TOKEN,
      apiEndpoint: API_ENDPOINT,
      httpRequest
    });

    expect(forTestUser).toBe(DEFAULT_PK);
    expect(forOtherUser).toBe(otherUserPk);
    expect(forTestUserAgain).toBe(DEFAULT_PK);
    expect(httpRequest).toHaveBeenCalledTimes(2);
  });
});
