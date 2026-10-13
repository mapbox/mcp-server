// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { createHash } from 'node:crypto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import {
  ExportMapHtmlTool,
  MAX_EXPORT_PAYLOAD_BYTES
} from '../../../src/tools/export-map-html-tool/ExportMapHtmlTool.js';
import { standaloneMapAppScript } from '../../../src/resources/ui-apps/mapAppStandalone.js';
import { buildSelfFetchRef } from '../../../src/utils/selfFetchRef.js';

const SERVER_PK = 'pk.eyJ1Ijoic2VydmVyIn0.server';

function textOf(result: { content: unknown }, index: number): string {
  const item = (result.content as Array<{ type: string; text: string }>)[index];
  return item.text;
}

function jsonTag(html: string, id: string): unknown {
  const match = html.match(
    new RegExp(
      `<script id="${id}" type="application/json">([\\s\\S]*?)</script>`
    )
  );
  if (!match) throw new Error(`no #${id} tag`);
  return JSON.parse(match[1]);
}

const markers = [
  { coordinates: [-73.99, 40.7], label: '1', popup: 'Shop one' },
  { coordinates: [-73.96, 40.72], label: '2', popup: 'Shop two' }
];

describe('ExportMapHtmlTool', () => {
  beforeEach(() => {
    process.env.MAPBOX_PUBLIC_TOKEN = SERVER_PK;
  });
  afterEach(() => {
    delete process.env.MAPBOX_PUBLIC_TOKEN;
    vi.restoreAllMocks();
  });

  it('returns a small standalone page with the data, token and pinned script', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({
      httpRequest,
      packageVersion: () => '9.9.9'
    }).run({
      markers,
      summary: 'Our shops'
    });

    expect(result.isError).toBe(false);
    const html = textOf(result, 1);
    // Small enough for an agent to copy into a file write; the ~60 KB map
    // script is loaded from the CDN instead of inlined.
    expect(html.length).toBeLessThan(10_000);
    expect(html).not.toContain('function initMap');

    expect(jsonTag(html, 'initial-data')).toMatchObject({
      markers,
      summary: 'Our shops'
    });
    expect(jsonTag(html, 'map-config')).toEqual({
      token: SERVER_PK,
      apiEndpoint: 'https://api.mapbox.com/'
    });

    const version = '9.9.9';
    const integrity = `sha384-${createHash('sha384').update(standaloneMapAppScript(), 'utf8').digest('base64')}`;
    expect(html).toContain(
      `<script src="https://cdn.jsdelivr.net/npm/@mapbox/mcp-server@${version}/dist/map-app/standalone.js" integrity="${integrity}" crossorigin="anonymous"></script>`
    );

    expect(result.structuredContent).toMatchObject({
      marker_count: 2,
      layer_count: 0,
      live_layer_count: 0,
      token_source: 'server_default',
      bytes: Buffer.byteLength(html, 'utf8')
    });
    // The page is returned once, as text, not repeated in structuredContent.
    expect(result.structuredContent).not.toHaveProperty('html');
    expect(JSON.stringify(result.structuredContent)).not.toContain('<html');
    expect(textOf(result, 0)).toContain('URL-restricted public token');
  });

  it('uses a provided public token', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({
      httpRequest,
      packageVersion: () => '9.9.9'
    }).run({
      markers,
      public_token: 'pk.eyJ1IjoibWUifQ.restricted'
    });

    expect(result.isError).toBe(false);
    expect(jsonTag(textOf(result, 1), 'map-config')).toMatchObject({
      token: 'pk.eyJ1IjoibWUifQ.restricted'
    });
    expect(result.structuredContent).toMatchObject({
      token_source: 'provided'
    });
  });

  it('rejects a public_token that is not a pk token', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({ httpRequest }).run({
      markers,
      public_token: 'sk.secret'
    });
    expect(result.isError).toBe(true);
  });

  it('says when layers are fetched live on each page load', async () => {
    const { httpRequest } = setupHttpRequest();
    const ref = buildSelfFetchRef('directions', {
      coordinates: [
        { longitude: -105, latitude: 39.75 },
        { longitude: -105.2, latitude: 39.66 }
      ]
    });
    const result = await new ExportMapHtmlTool({ httpRequest }).run({
      payload_refs: [ref]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ live_layer_count: 1 });
    expect(textOf(result, 0)).toContain(
      'fetches 1 layer from the Mapbox API each time it loads'
    );
    expect(
      (jsonTag(textOf(result, 1), 'initial-data') as { selfFetch: unknown[] })
        .selfFetch
    ).toHaveLength(1);
  });

  it('keeps a summary containing </script> inside its JSON tag', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({ httpRequest }).run({
      markers,
      summary: 'a</script><script>alert(1)</script>b'
    });

    const html = textOf(result, 1);
    expect(html).not.toContain('</script><script>alert(1)');
    expect(jsonTag(html, 'initial-data')).toMatchObject({
      summary: 'a</script><script>alert(1)</script>b'
    });
  });

  it('rejects map data over the size limit with next steps', async () => {
    const { httpRequest } = setupHttpRequest();
    // One long line: ~16 bytes per coordinate pair, well over the limit.
    const count = Math.ceil(MAX_EXPORT_PAYLOAD_BYTES / 16) + 1000;
    const coordinates = Array.from({ length: count }, (_, i) => [
      -105 + i * 1e-5,
      39.7
    ]);
    const result = await new ExportMapHtmlTool({
      httpRequest,
      packageVersion: () => '9.9.9'
    }).run({
      layers: [
        {
          id: 'long-line',
          type: 'line',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates }
          }
        }
      ]
    });

    expect(result.isError).toBe(true);
    expect(textOf(result, 0)).toContain('limit for a standalone page');
    expect(textOf(result, 0)).toContain('simplify_tool');
    expect(result.content).toHaveLength(1);
  });

  it('errors when there is nothing to draw', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({ httpRequest }).run({});
    expect(result.isError).toBe(true);
    expect(textOf(result, 0)).toContain('nothing to draw');
  });

  it('errors with next steps when refs have expired', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({ httpRequest }).run({
      payload_refs: ['mapbox://temp/map-payload-does-not-exist']
    });
    expect(result.isError).toBe(true);
    expect(textOf(result, 0)).toContain(
      'none of the provided payload_refs could be resolved'
    );
  });

  it('inlines the map script when the package version is unknown', async () => {
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({
      httpRequest,
      packageVersion: () => '0.0.0'
    }).run({ markers });

    expect(result.isError).toBe(false);
    const html = textOf(result, 1);
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).toContain('function initMap');
    expect(jsonTag(html, 'initial-data')).toMatchObject({ markers });
    expect(result.structuredContent).toMatchObject({ script_url: 'inline' });
    expect(textOf(result, 0)).toContain('running from source');
  });

  it('errors when no public token can be found', async () => {
    delete process.env.MAPBOX_PUBLIC_TOKEN;
    const { httpRequest } = setupHttpRequest();
    const result = await new ExportMapHtmlTool({ httpRequest }).run({
      markers
    });
    expect(result.isError).toBe(true);
    expect(textOf(result, 0)).toContain('Pass `public_token`');
  });
});
