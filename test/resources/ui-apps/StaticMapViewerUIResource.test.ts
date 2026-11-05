// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import {
  StaticMapViewerUIResource,
  STATIC_MAP_VIEWER_URI
} from '../../../src/resources/ui-apps/StaticMapViewerUIResource.js';
import { renderStaticMapViewerHtml } from '../../../src/resources/ui-apps/staticMapViewerHtml.js';
import { StaticMapImageTool } from '../../../src/tools/static-map-image-tool/StaticMapImageTool.js';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';

const PK_URL =
  'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/-77.0369,38.9072,12/1000x700?access_token=pk.eyJ1IjoidGVzdCJ9.public';

describe('StaticMapViewerUIResource', () => {
  it('serves the viewer as an MCP App with an images-only CSP', async () => {
    const result = await new StaticMapViewerUIResource().read();
    const content = result.contents[0] as unknown as {
      uri: string;
      mimeType: string;
      text: string;
      _meta: { ui: { csp: { resourceDomains: string[] } } };
    };

    expect(content.uri).toBe(STATIC_MAP_VIEWER_URI);
    expect(content.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(content.text).toContain('<img id="map"');
    expect(content._meta.ui.csp).toEqual({
      resourceDomains: ['https://api.mapbox.com']
    });
  });

  it('allows a custom API endpoint origin too', async () => {
    const result = await new StaticMapViewerUIResource({
      apiEndpoint: () => 'https://api.example.test/'
    }).read();
    const content = result.contents[0] as unknown as {
      _meta: { ui: { csp: { resourceDomains: string[] } } };
    };
    expect(content._meta.ui.csp.resourceDomains).toEqual([
      'https://api.mapbox.com',
      'https://api.example.test'
    ]);
  });

  it('is the UI static_map_image_tool points at', () => {
    const tool = new StaticMapImageTool(setupHttpRequest());
    expect(tool.meta.ui.resourceUri).toBe(STATIC_MAP_VIEWER_URI);
  });
});

/** Runs the viewer script against a minimal fake DOM and host. */
function loadViewer() {
  const html = renderStaticMapViewerHtml({
    apiEndpoint: 'https://api.mapbox.com/'
  });
  const script = html.slice(
    html.indexOf('<script>') + '<script>'.length,
    html.indexOf('</script>')
  );
  const element = () => ({
    style: {} as Record<string, string>,
    textContent: '',
    src: '',
    alt: '',
    offsetHeight: 0,
    onload: null as null | (() => void),
    onerror: null as null | (() => void)
  });
  const img = element();
  const messageEl = element();
  const listeners: Record<string, Array<(e: unknown) => void>> = {};
  const posted: Array<{ method?: string; params?: Record<string, unknown> }> =
    [];
  const window = {
    parent: { postMessage: (m: (typeof posted)[number]) => posted.push(m) },
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      (listeners[type] ??= []).push(cb);
    }
  } as Record<string, unknown>;
  const document = {
    getElementById: (id: string) => (id === 'map' ? img : messageEl)
  };
  vm.runInNewContext(script, { window, document, Promise });
  const sendToolResult = (params: unknown) =>
    listeners.message.forEach((cb) =>
      cb({ data: { method: 'ui/notifications/tool-result', params } })
    );
  return { img, messageEl, posted, sendToolResult };
}

describe('static map viewer page', () => {
  it('starts the MCP Apps handshake', () => {
    const { posted } = loadViewer();
    expect(posted[0].method).toBe('ui/initialize');
  });

  it('shows the image item from the tool result at full size', () => {
    const { img, posted, sendToolResult } = loadViewer();

    sendToolResult({
      content: [
        {
          type: 'text',
          text: 'Static map image (1000x700, mapbox/streets-v12) is attached to this result.'
        },
        { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }
      ]
    });

    expect(img.src).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(img.alt).toBe('Static map image (1000x700, mapbox/streets-v12)');
    expect(img.style.display).toBe('block');
    img.offsetHeight = 420;
    img.onload?.();
    expect(posted.at(-1)).toEqual({
      jsonrpc: '2.0',
      method: 'ui/notifications/size-changed',
      params: { height: 420 }
    });
  });

  it('falls back to the public-token URL when there is no image item', () => {
    const { img, sendToolResult } = loadViewer();

    sendToolResult({
      content: [
        {
          type: 'text',
          text: `The image is not attached, and ... Give it as a link instead.\nImage URL: ${PK_URL}`
        },
        {
          type: 'text',
          text: '⚠️ Image (766KB) is too large to return inline.\nRead mapbox://response/static-map?data=abc with the MCP resource API to get it.'
        }
      ]
    });

    expect(img.src).toBe(PK_URL);
  });

  it("finds the URL in the viewer's link line too", () => {
    const { img, sendToolResult } = loadViewer();

    sendToolResult({
      content: [
        {
          type: 'text',
          text: `Static map image (1000x700, mapbox/streets-v12) is shown to the user at full size in this tool's map viewer.\nIf the user asks for a link to the image, use this URL; it carries the account's public token: ${PK_URL}`
        }
      ]
    });

    expect(img.src).toBe(PK_URL);
  });

  it.each([
    [
      'another origin',
      PK_URL.replace('https://api.mapbox.com', 'https://evil.example')
    ],
    ['no public token', PK_URL.replace(/\?access_token=.*$/, '')]
  ])('ignores a URL with %s', (_, url) => {
    const { img, messageEl, sendToolResult } = loadViewer();

    sendToolResult({
      content: [{ type: 'text', text: `Image URL: ${url}` }]
    });

    expect(img.src).toBe('');
    expect(messageEl.textContent).toBe("The map image isn't available here.");
  });

  it('ignores image items that are not PNG or JPEG', () => {
    const { img, sendToolResult } = loadViewer();

    sendToolResult({
      content: [{ type: 'image', data: 'PHN2Zz4=', mimeType: 'image/svg+xml' }]
    });

    expect(img.src).toBe('');
  });

  it('shows the error text for a failed call', () => {
    const { img, messageEl, sendToolResult } = loadViewer();

    sendToolResult({
      isError: true,
      content: [{ type: 'text', text: 'Not Authorized - Invalid Token' }]
    });

    expect(img.style.display).toBe('none');
    expect(messageEl.textContent).toBe('Not Authorized - Invalid Token');
  });
});
