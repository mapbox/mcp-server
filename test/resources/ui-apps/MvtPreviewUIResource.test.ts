// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// JWT with payload {"sub":"test","u":"testuser"} (base64)
const SK_TOKEN = 'sk.eyJzdWIiOiJ0ZXN0IiwidSI6InRlc3R1c2VyIn0.signature';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MvtPreviewUIResource,
  MVT_PREVIEW_URI
} from '../../../src/resources/ui-apps/MvtPreviewUIResource.js';
import { __resetMapboxPublicTokenCache } from '../../../src/utils/mapboxPublicToken.js';
import { resourceTextOf } from '../../utils/resultTestUtils.js';
import type { HttpRequest } from '../../../src/utils/types.js';

const authed = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http: { authInfo: { token: SK_TOKEN } as any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('MvtPreviewUIResource', () => {
  beforeEach(() => {
    __resetMapboxPublicTokenCache();
    delete process.env.MAPBOX_PUBLIC_TOKEN;
  });

  it('serves the viewer with the public token and opens it as a tab', async () => {
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

    const result = await new MvtPreviewUIResource({ httpRequest }).read(
      MVT_PREVIEW_URI,
      authed
    );

    const entry = result.contents[0];
    expect(entry.uri).toBe(MVT_PREVIEW_URI);
    expect(entry.mimeType).toBe('text/html;profile=mcp-app');
    const html = resourceTextOf(result);
    expect(html).toContain('<title>Mapbox Vector Tile Viewer</title>');
    expect(html).toContain('"pk.eyJ1IjoidGVzdHVzZXIifQ.pub"');
    expect(html).not.toContain(SK_TOKEN);
    expect(entry._meta).toMatchObject({
      ui: {
        csp: {
          connectDomains: [
            'https://api.mapbox.com',
            'https://events.mapbox.com'
          ],
          resourceDomains: ['https://api.mapbox.com'],
          workerDomains: ['blob:']
        }
      },
      'openai/ui': {
        preferredDisplayMode: 'fullscreen',
        availableDisplayModes: ['inline', 'fullscreen']
      }
    });
  });
});
