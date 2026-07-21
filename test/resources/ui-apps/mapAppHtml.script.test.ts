// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import * as vm from 'node:vm';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * with just enough of window/document/mapboxgl stubbed to exercise the
 * postMessage protocol handling without a real browser or GL JS. Verifies
 * the ChatGPT fix directly: an inline payload in structuredContent must be
 * used without ever attempting `resources/read` (which ChatGPT's MCP Apps
 * bridge doesn't support at all), while a ref-only result (Claude
 * Desktop, which strips structuredContent) still falls back to it.
 */
function loadScriptSandbox() {
  const html = renderMapAppHtml({ publicToken: 'pk.test-token' });
  const scriptMatch = html.match(
    /<script>\n\(function\(\) \{[\s\S]*?\}\)\(\);\n<\/script>/
  );
  if (!scriptMatch) {
    throw new Error('Could not find inline <script> block in rendered HTML');
  }
  const scriptSource = scriptMatch[0]
    .replace(/^<script>\n/, '')
    .replace(/<\/script>$/, '');

  const postMessageCalls: Array<Record<string, unknown>> = [];
  let messageListener: ((event: { data: unknown }) => void) | undefined;

  function fakeElement() {
    return {
      style: {} as Record<string, string>,
      textContent: '',
      className: ''
    };
  }

  const fakeMapInstance = {
    addControl: () => {},
    on: (event: string, cb: () => void) => {
      if (event === 'load') cb();
    },
    addSource: () => {},
    addLayer: () => {},
    getLayer: () => null,
    getSource: () => null,
    removeLayer: () => {},
    removeSource: () => {},
    fitBounds: () => {},
    flyTo: () => {},
    resize: () => {}
  };

  const fakeMarkerInstance = {
    setLngLat: () => fakeMarkerInstance,
    addTo: () => fakeMarkerInstance,
    setPopup: () => fakeMarkerInstance,
    remove: () => {}
  };

  const sandbox: Record<string, unknown> = {
    window: {
      addEventListener: (event: string, cb: typeof messageListener) => {
        if (event === 'message') messageListener = cb;
      },
      parent: {
        postMessage: (message: Record<string, unknown>) => {
          postMessageCalls.push(message);
        }
      }
    },
    document: {
      getElementById: () => fakeElement(),
      createElement: () => fakeElement()
    },
    mapboxgl: {
      accessToken: '',
      Map: function Map() {
        return fakeMapInstance;
      },
      NavigationControl: function NavigationControl() {},
      Marker: function Marker() {
        return fakeMarkerInstance;
      },
      Popup: function Popup() {
        return { setText: () => ({}) };
      }
    },
    console,
    setTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  // Resolve the initial `ui/initialize` request so the app proceeds past
  // its handshake (mirrors what a real host would respond with).
  const initId = postMessageCalls.find((m) => m.method === 'ui/initialize')
    ?.id as number | undefined;
  if (initId !== undefined && messageListener) {
    messageListener({ data: { jsonrpc: '2.0', id: initId, result: {} } });
  }

  return {
    sendToolResult: (result: unknown) => {
      messageListener?.({
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: result
        }
      });
    },
    postMessageCalls,
    map: fakeMapInstance
  };
}

describe('mapAppHtml inline-payload-first tool-result handling', () => {
  it('renders directly from an inline payload without ever calling resources/read', () => {
    const { sendToolResult, postMessageCalls, map } = loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
          summary: 'Test',
          layers: [
            {
              id: 'route',
              type: 'line',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-77, 38],
                    [-76, 39]
                  ]
                },
                properties: {}
              }
            }
          ]
        }
      }
    });

    expect(addLayerSpy).toHaveBeenCalled();
    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      false
    );
  });

  it('falls back to resources/read when structuredContent only has a ref (e.g. Claude Desktop)', () => {
    const { sendToolResult, postMessageCalls } = loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: { ref: 'mapbox://temp/map-payload-abc' }
      }
    });

    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      true
    );
  });
});
