// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

const SK_TOKEN = 'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MapMatchingAppUIResource } from '../../../src/resources/ui-apps/MapMatchingAppUIResource.js';
import { __resetMapboxPublicTokenCache } from '../../../src/utils/mapboxPublicToken.js';

function makeOkJson(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('MapMatchingAppUIResource', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves HTML with raw + matched line layers and the public token', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/'))
        return makeOkJson([
          { usage: 'pk', default: true, token: 'pk.fake' }
        ]) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const resource = new MapMatchingAppUIResource({ httpRequest });

    const result = await resource.read(
      'ui://mapbox/map-matching-app/index.html',
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authInfo: { token: SK_TOKEN } as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    );

    const entry = result.contents[0];
    expect(entry.mimeType).toBe('text/html;profile=mcp-app');
    expect(entry.text as string).toContain('pk.fake');
    expect(entry.text as string).toContain('matched-line');
    expect(entry.text as string).toContain('raw-line');
    expect(entry.text as string).toContain('line-dasharray');
  });
});
