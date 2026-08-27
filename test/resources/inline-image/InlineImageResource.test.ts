// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { InlineImageResource } from '../../../src/resources/inline-image/InlineImageResource.js';
import { buildInlineImageRef } from '../../../src/utils/inlineImageRef.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

describe('InlineImageResource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("re-fetches the image from the ref's own params via the real resources/read path with zero prior server-side state — the actual fix for the hosted multi-task follow-up bug", async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      arrayBuffer: async () => imageBytes.buffer
    });

    const resource = new InlineImageResource({ httpRequest });
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 1280, height: 900 },
      style: 'mapbox/streets-v12'
    });

    // No store, no cache, no owner check — this re-issues the request using
    // the ref's own params, so it succeeds identically whether it's the same
    // process, a restarted one, or a different hosted ECS task than the one
    // that handled the original tool call.
    const result = await resource.read(ref, {
      authInfo: { token: TOKEN }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
    const calledUrl = mockHttpRequest.mock.calls[0][0].toString();
    expect(calledUrl).toContain('styles/v1/mapbox/streets-v12/static/');
    expect(calledUrl).toContain(`access_token=${TOKEN}`);

    expect(result.contents[0].mimeType).toBe('image/png');
    expect(Buffer.from(result.contents[0].blob as string, 'base64')).toEqual(
      Buffer.from(imageBytes)
    );
  });

  it("picks the jpeg mime type for satellite styles, matching the tool's own behavior", async () => {
    const { httpRequest } = setupHttpRequest({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    });
    const resource = new InlineImageResource({ httpRequest });
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: 0, latitude: 0 },
      zoom: 5,
      size: { width: 600, height: 400 },
      style: 'mapbox/satellite-v9'
    });

    const result = await resource.read(ref, {
      authInfo: { token: TOKEN }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result.contents[0].mimeType).toBe('image/jpeg');
  });

  it('returns a text/plain explanation (not a crash) for a malformed ref', async () => {
    const { httpRequest } = setupHttpRequest();
    const resource = new InlineImageResource({ httpRequest });
    const result = await resource.read(
      'mapbox://inline-image/static-map?data=!!!'
    );

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('malformed');
  });

  it('returns a text/plain explanation when no access token is available', async () => {
    // Other test files in this suite set process.env.MAPBOX_ACCESS_TOKEN at
    // module load time; stub it away explicitly rather than relying on it
    // being unset.
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', undefined);
    const { httpRequest } = setupHttpRequest();
    const resource = new InlineImageResource({ httpRequest });
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: 0, latitude: 0 },
      zoom: 5,
      size: { width: 600, height: 400 },
      style: 'mapbox/streets-v12'
    });

    const result = await resource.read(ref);

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('access token');
  });

  it('returns a text/plain explanation when the re-fetch fails upstream', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });
    const resource = new InlineImageResource({ httpRequest });
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: 0, latitude: 0 },
      zoom: 5,
      size: { width: 600, height: 400 },
      style: 'mapbox/streets-v12'
    });

    const result = await resource.read(ref, {
      authInfo: { token: TOKEN }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('401');
  });
});
