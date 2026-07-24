// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import * as vm from 'node:vm';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';
import { buildInlinePayloadRef } from '../../../src/utils/inlinePayloadRef.js';

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

  // The script fetches each element by id exactly once at load time and
  // keeps the reference, so returning the same object per id lets tests
  // inspect state (e.g. errorEl.textContent) after the fact.
  const elementsById: Record<string, ReturnType<typeof fakeElement>> = {};
  function getElementById(id: string) {
    if (!elementsById[id]) elementsById[id] = fakeElement();
    return elementsById[id];
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

  // Overridable per-test; self-fetch tests replace this with a vi.fn().
  let fetchImpl: (url: string) => Promise<unknown> = () =>
    Promise.resolve({ ok: false, status: 599, json: async () => ({}) });

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
      getElementById: getElementById,
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
    setTimeout,
    URLSearchParams,
    fetch: (url: string) => fetchImpl(url)
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
    // Resolves the most recent still-pending resources/read request with
    // the given JSON-RPC `result`, mirroring what the real host does after
    // the iframe asks to dereference a payload ref.
    resolveResourcesRead: (result: unknown) => {
      const call = [...postMessageCalls]
        .reverse()
        .find((m) => m.method === 'resources/read');
      if (!call || messageListener === undefined) {
        throw new Error('No pending resources/read call to resolve');
      }
      messageListener({
        data: { jsonrpc: '2.0', id: call.id, result }
      });
    },
    setFetchImpl: (impl: (url: string) => Promise<unknown>) => {
      fetchImpl = impl;
    },
    postMessageCalls,
    map: fakeMapInstance,
    errorEl: elementsById.error,
    summaryEl: elementsById.summary
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

  it("extracts a self-describing mapbox://inline/ ref from the sentinel text and renders it (Claude Desktop's actual path: structuredContent stripped, ref only in content[])", async () => {
    const { sendToolResult, resolveResourcesRead, postMessageCalls, map } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    const payload = {
      summary: 'Test trip',
      layers: [
        {
          id: 'route',
          type: 'line' as const,
          data: {
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [-77, 38],
                [-76, 39]
              ] as [number, number][]
            },
            properties: {}
          }
        }
      ]
    };
    const ref = buildInlinePayloadRef(payload);

    // No structuredContent at all — this is exactly what Claude Desktop
    // forwards to the iframe (it strips structuredContent entirely from
    // the postMessage). The only way the ref reaches the iframe is via
    // the sentinel-tagged text in content[].
    sendToolResult({
      content: [{ type: 'text', text: `[[MAPBOX_RENDER_REF]] ${ref}` }]
    });

    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      true
    );
    const readCall = postMessageCalls.find(
      (m) => m.method === 'resources/read'
    );
    expect((readCall?.params as { uri?: string } | undefined)?.uri).toBe(ref);

    // Mirrors what InlinePayloadResource.read() actually returns — resolved
    // straight from the ref's own contents, no server-side state involved.
    resolveResourcesRead({
      contents: [
        {
          uri: ref,
          mimeType: 'application/json',
          text: JSON.stringify(payload)
        }
      ]
    });
    await Promise.resolve();

    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'route' })
    );
  });

  it('shows the server\'s expiry explanation (not a generic "malformed" error) when the ref has expired', async () => {
    const { sendToolResult, resolveResourcesRead, errorEl } =
      loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: { ref: 'mapbox://temp/map-payload-expired' }
      }
    });
    // Mirrors TemporaryDataResource.read()'s "not found" response: a
    // text/plain explanation rather than a JSON payload.
    resolveResourcesRead({
      contents: [
        {
          uri: 'mapbox://temp/map-payload-expired',
          mimeType: 'text/plain',
          text: 'Resource not found or expired. Temporary resources have a 30-minute TTL.'
        }
      ]
    });
    await Promise.resolve();

    expect(errorEl?.textContent).toContain('Resource not found or expired');
    expect(errorEl?.textContent).toContain('Ask again to regenerate the map.');
  });

  it('still shows the generic "malformed" error for a JSON response that has no layers/markers', async () => {
    const { sendToolResult, resolveResourcesRead, errorEl } =
      loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: { ref: 'mapbox://temp/map-payload-bad' }
      }
    });
    resolveResourcesRead({
      contents: [
        {
          uri: 'mapbox://temp/map-payload-bad',
          mimeType: 'application/json',
          text: JSON.stringify({ notAPayload: true })
        }
      ]
    });
    await Promise.resolve();

    expect(errorEl?.textContent).toBe('Map payload was empty or malformed.');
  });
});

describe('mapAppHtml directions self-fetch', () => {
  it('fetches and draws the route itself from a selfFetch descriptor', async () => {
    const { sendToolResult, setFetchImpl, map, summaryEl, errorEl } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    const addSourceSpy = vi.fn();
    map.addLayer = addLayerSpy;
    map.addSource = addSourceSpy;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76.5, 38.5],
                [-76, 39]
              ]
            },
            distance: 16093, // 10 mi
            duration: 1200 // 20 min
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/directions?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'directions',
              params: {
                coordinates: [
                  { longitude: -77, latitude: 38 },
                  { longitude: -76, latitude: 39 }
                ],
                routing_profile: 'mapbox/driving-traffic',
                alternatives: false
              }
            }
          ]
        }
      }
    });
    // Let the async fetchSpy + fetch().then().then() chain settle.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'directions/v5/mapbox/driving-traffic/'
    );
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-directions-route',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-directions-route' })
    );
    expect(summaryEl?.textContent).toBe('Route: 10.0 mi, 20 min');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('never fetches when the selfFetch params are unsafe (e.g. forged routing_profile)', async () => {
    const { sendToolResult, setFetchImpl, errorEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 599,
      json: async () => ({})
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/directions?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'directions',
              params: {
                coordinates: [
                  { longitude: -77, latitude: 38 },
                  { longitude: -76, latitude: 39 }
                ],
                // Would let a forged param inject an extra path segment
                // into the request URL if not validated.
                routing_profile: 'mapbox/driving/../../evil'
              }
            }
          ]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch route');
  });
});

describe('mapAppHtml isochrone self-fetch', () => {
  it('fetches and draws contours itself from a selfFetch descriptor', async () => {
    const { sendToolResult, setFetchImpl, map, summaryEl, errorEl } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    const addSourceSpy = vi.fn();
    map.addLayer = addLayerSpy;
    map.addSource = addSourceSpy;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { contour: 10, fillColor: '6b7280' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-74.01, 40.71],
                  [-74.0, 40.71],
                  [-74.0, 40.72],
                  [-74.01, 40.72],
                  [-74.01, 40.71]
                ]
              ]
            }
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/isochrone?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'isochrone',
              params: {
                coordinates: { longitude: -74.006, latitude: 40.7128 },
                profile: 'mapbox/driving',
                contours_minutes: [10]
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'isochrone/v1/mapbox/driving/-74.006%2C40.7128'
    );
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-isochrone-fill-0',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-isochrone-fill-0' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-isochrone-line-0' })
    );
    expect(summaryEl?.textContent).toBe('Reachable by driving: 10 min');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('never fetches when the selfFetch params are unsafe (e.g. forged profile)', async () => {
    const { sendToolResult, setFetchImpl, errorEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 599,
      json: async () => ({})
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/isochrone?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'isochrone',
              params: {
                coordinates: { longitude: -74.006, latitude: 40.7128 },
                profile: 'mapbox/driving/../../evil'
              }
            }
          ]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch isochrone');
  });
});
