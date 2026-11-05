// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWT with payload {"sub":"test","u":"testuser"} (base64)
const SK_TOKEN = 'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsoleUIResource,
  CONSOLE_APP_URI,
  consoleAppCsp
} from '../../../src/resources/ui-apps/ConsoleUIResource.js';
import { __resetMapboxPublicTokenCache } from '../../../src/utils/mapboxPublicToken.js';
import { resourceTextOf } from '../../utils/resultTestUtils.js';
import type { HttpRequest } from '../../../src/utils/types.js';

const authed = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http: { authInfo: { token: SK_TOKEN } as any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('ConsoleUIResource', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  it('serves the console HTML with a public token for thumbnails', async () => {
    const httpRequest = vi.fn<HttpRequest>(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [
            {
              usage: 'pk',
              default: true,
              token: 'pk.eyJ1IjoidGVzdHVzZXIifQ.pub'
            }
          ]
        }) as unknown as Response
    );

    const result = await new ConsoleUIResource({ httpRequest }).read(
      CONSOLE_APP_URI,
      authed
    );

    const entry = result.contents[0];
    expect(entry.uri).toBe(CONSOLE_APP_URI);
    expect(entry.mimeType).toBe('text/html;profile=mcp-app');
    const html = resourceTextOf(result);
    expect(html).toContain('<title>Mapbox Console</title>');
    expect(html).toContain('"pk.eyJ1IjoidGVzdHVzZXIifQ.pub"');
    expect(html).not.toContain(SK_TOKEN);
    expect(entry._meta).toMatchObject({
      ui: { csp: { resourceDomains: ['https://api.mapbox.com'] } },
      'openai/ui': { preferredDisplayMode: 'fullscreen' }
    });
  });

  it('still serves the console when no public token can be found', async () => {
    const httpRequest = vi.fn<HttpRequest>(
      async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({})
        }) as unknown as Response
    );

    const html = resourceTextOf(
      await new ConsoleUIResource({ httpRequest }).read(CONSOLE_APP_URI, authed)
    );
    expect(html).toContain('var TOKEN = "";');
  });

  it('allows a custom API endpoint origin for thumbnails', () => {
    expect(consoleAppCsp('https://api.example.com/').resourceDomains).toEqual([
      'https://api.mapbox.com',
      'https://api.example.com'
    ]);
  });
});
