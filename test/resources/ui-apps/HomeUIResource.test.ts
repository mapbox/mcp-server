// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWT with payload {"sub":"test","u":"testuser"} (base64)
const SK_TOKEN = 'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HomeUIResource,
  HOME_APP_URI,
  homeAppCsp
} from '../../../src/resources/ui-apps/HomeUIResource.js';
import { __resetMapboxPublicTokenCache } from '../../../src/utils/mapboxPublicToken.js';
import { resourceTextOf } from '../../utils/resultTestUtils.js';
import type { HttpRequest } from '../../../src/utils/types.js';

const authed = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http: { authInfo: { token: SK_TOKEN } as any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('HomeUIResource', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  it('serves the home page HTML with a public token for thumbnails', async () => {
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

    const result = await new HomeUIResource({ httpRequest }).read(
      HOME_APP_URI,
      authed
    );

    const entry = result.contents[0];
    expect(entry.uri).toBe(HOME_APP_URI);
    expect(entry.mimeType).toBe('text/html;profile=mcp-app');
    const html = resourceTextOf(result);
    expect(html).toContain('<title>Mapbox</title>');
    expect(html).toContain('"pk.eyJ1IjoidGVzdHVzZXIifQ.pub"');
    expect(html).toContain('var MENTION = "@Mapbox ";');
    expect(html).not.toContain(SK_TOKEN);
    expect(entry._meta).toMatchObject({
      ui: { csp: { resourceDomains: ['https://api.mapbox.com'] } },
      'openai/ui': { preferredDisplayMode: 'fullscreen' }
    });
  });

  it('still serves the home page when no public token can be found', async () => {
    const httpRequest = vi.fn<HttpRequest>(
      async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({})
        }) as unknown as Response
    );

    const html = resourceTextOf(
      await new HomeUIResource({ httpRequest }).read(HOME_APP_URI, authed)
    );
    expect(html).toContain('var TOKEN = "";');
  });

  it('allows GL JS for the style preview and a custom API endpoint for thumbnails', () => {
    expect(homeAppCsp('https://api.example.com/')).toEqual({
      connectDomains: [
        'https://api.mapbox.com',
        'https://events.mapbox.com',
        'https://api.example.com'
      ],
      resourceDomains: ['https://api.mapbox.com', 'https://api.example.com'],
      workerDomains: ['blob:']
    });
  });

  it('mentions MAPBOX_CHATGPT_PLUGIN_NAME in starter drafts', async () => {
    process.env.MAPBOX_CHATGPT_PLUGIN_NAME = ' MCP-dev ';
    try {
      const html = resourceTextOf(
        await new HomeUIResource({ httpRequest: vi.fn() }).read(HOME_APP_URI)
      );
      expect(html).toContain('var MENTION = "@MCP-dev ";');
    } finally {
      delete process.env.MAPBOX_CHATGPT_PLUGIN_NAME;
    }
  });
});
