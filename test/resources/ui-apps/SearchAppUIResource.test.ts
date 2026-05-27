// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

const SK_TOKEN = 'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { SearchAppUIResource } from '../../../src/resources/ui-apps/SearchAppUIResource.js';
import { __resetMapboxPublicTokenCache } from '../../../src/utils/mapboxPublicToken.js';

const fakeTokenList = [
  {
    id: 'cktest123',
    usage: 'pk',
    default: true,
    token: 'pk.eyJ1IjoidGVzdHVzZXIifQ.fake-public-token'
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

describe('SearchAppUIResource', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves HTML with the mcp-app mime type, the public token, and the search-specific marker class', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('tokens/v2/'))
        return makeOkJson(fakeTokenList) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const resource = new SearchAppUIResource({ httpRequest });

    const result = await resource.read('ui://mapbox/search-app/index.html', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authInfo: { token: SK_TOKEN } as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const entry = result.contents[0];
    expect(entry.mimeType).toBe('text/html;profile=mcp-app');
    expect(entry.uri).toBe('ui://mapbox/search-app/index.html');
    expect(entry.text as string).toContain(
      'pk.eyJ1IjoidGVzdHVzZXIifQ.fake-public-token'
    );
    expect(entry.text as string).toContain('result-marker');
    expect(entry.text as string).toContain('proximity-marker');

    const meta = (entry as { _meta?: unknown })._meta as
      | { ui?: { csp?: { workerDomains?: string[] } } }
      | undefined;
    expect(meta?.ui?.csp?.workerDomains).toContain('blob:');
  });
});
