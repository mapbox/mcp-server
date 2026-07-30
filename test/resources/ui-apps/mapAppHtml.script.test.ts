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

  it('draws the route at selectedRouteIndex, not just the first one, when multiple routes come back', async () => {
    const { sendToolResult, setFetchImpl, map, summaryEl } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76, 39]
              ]
            },
            distance: 10000,
            duration: 600
          },
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76.5, 38.2],
                [-76, 39]
              ]
            },
            distance: 20000,
            duration: 1200
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
                selectedRouteIndex: 1
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Summary is derived from whichever route got drawn — routes[1]'s
    // distance/duration (20000m / 1609.34 ≈ 12.4mi), not routes[0]'s.
    expect(summaryEl?.textContent).toContain('12.4 mi');
    expect(summaryEl?.textContent).toContain('20 min');
  });

  it('falls back to the first route when selectedRouteIndex is out of range', async () => {
    const { sendToolResult, setFetchImpl, summaryEl } = loadScriptSandbox();

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76, 39]
              ]
            },
            distance: 10000,
            duration: 600
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
                // The fresh re-fetch only returned 1 route this time.
                selectedRouteIndex: 3
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(summaryEl?.textContent).toContain('6.2 mi');
  });

  it('never fetches when selectedRouteIndex is not a valid non-negative integer', async () => {
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
                selectedRouteIndex: -1
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

describe('mapAppHtml map matching self-fetch', () => {
  it('fetches and draws the raw + matched trace itself from a selfFetch descriptor', async () => {
    const { sendToolResult, setFetchImpl, map, summaryEl, errorEl } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    const addSourceSpy = vi.fn();
    map.addLayer = addLayerSpy;
    map.addSource = addSourceSpy;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        matchings: [
          {
            confidence: 0.9,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-122.4194, 37.7749],
                [-122.4195, 37.775]
              ]
            }
          }
        ],
        tracepoints: [
          { location: [-122.4194, 37.7749] },
          { location: [-122.4195, 37.775] }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/map_matching?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'map_matching',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 }
                ],
                profile: 'driving'
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'matching/v5/mapbox/driving/-122.4194,37.7749;-122.4195,37.775'
    );
    expect(String(fetchSpy.mock.calls[0][0])).toContain('geometries=geojson');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('overview=full');
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-map-matching-raw',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-map-matching-matched' })
    );
    expect(summaryEl?.textContent).toBe(
      'Matched 2/2 GPS points (confidence 90%)'
    );
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('shows an error for NoMatch instead of a broken map', async () => {
    const { sendToolResult, setFetchImpl, errorEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 'NoMatch' })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/map_matching?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'map_matching',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 }
                ],
                profile: 'driving'
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(errorEl?.textContent).toContain('could not match the trace');
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
          ref: 'mapbox://selffetch/map_matching?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'map_matching',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 }
                ],
                profile: 'driving/../../evil'
              }
            }
          ]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch map match');
  });
});

describe('mapAppHtml search self-fetch', () => {
  it('fetches and draws numbered POI markers + search-center pin from a selfFetch descriptor', async () => {
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
            properties: { name: 'Blue Bottle', full_address: '66 Mint St' },
            geometry: { type: 'Point', coordinates: [-122.39, 37.78] }
          },
          {
            type: 'Feature',
            properties: { name: 'Sightglass', full_address: '270 7th St' },
            geometry: { type: 'Point', coordinates: [-122.41, 37.77] }
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/search?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'search',
              params: {
                q: 'coffee',
                proximity: { longitude: -122.4194, latitude: 37.7749 }
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'search/searchbox/v1/forward'
    );
    expect(String(fetchSpy.mock.calls[0][0])).toContain('q=coffee');
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-search-results',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-search-results' })
    );
    expect(summaryEl?.textContent).toBe('2 results for "coffee"');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('filters to the selected result when selectedMapboxId is set', async () => {
    const { sendToolResult, setFetchImpl, summaryEl } = loadScriptSandbox();

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Springfield #1', mapbox_id: 'id-1' },
            geometry: { type: 'Point', coordinates: [-73, 42] }
          },
          {
            type: 'Feature',
            properties: { name: 'Springfield #2', mapbox_id: 'id-2' },
            geometry: { type: 'Point', coordinates: [-74, 43] }
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/search?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'search',
              params: { q: 'Springfield', selectedMapboxId: 'id-2' }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Only the selected result (Springfield #2) should count toward the
    // summary, not both fresh results.
    expect(summaryEl?.textContent).toBe('1 result for "Springfield"');
  });

  it('never fetches when the selfFetch params are unsafe (missing q)', async () => {
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
          ref: 'mapbox://selffetch/search?data=abc',
          layers: [],
          selfFetch: [{ tool: 'search', params: {} }]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch search results');
  });
});

describe('mapAppHtml category search self-fetch', () => {
  it('fetches and draws numbered POI markers from a selfFetch descriptor', async () => {
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
            properties: { name: 'Cafe Reveille' },
            geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/category_search?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'category_search',
              params: {
                category: 'cafe',
                proximity: { longitude: -122.42, latitude: 37.78 }
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'search/searchbox/v1/category/cafe'
    );
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-search-results',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-search-results' })
    );
    expect(summaryEl?.textContent).toBe('1 result for "cafe"');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('never fetches when the selfFetch params are unsafe (missing category)', async () => {
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
          ref: 'mapbox://selffetch/category_search?data=abc',
          layers: [],
          selfFetch: [{ tool: 'category_search', params: {} }]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain(
      'Could not fetch category search results'
    );
  });
});

describe('mapAppHtml optimization self-fetch', () => {
  it('fetches and draws the trip line + numbered visit markers from a selfFetch descriptor', async () => {
    const { sendToolResult, setFetchImpl, map, summaryEl, errorEl } =
      loadScriptSandbox();
    const addLayerSpy = vi.fn();
    const addSourceSpy = vi.fn();
    map.addLayer = addLayerSpy;
    map.addSource = addSourceSpy;

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        trips: [
          {
            distance: 16093,
            duration: 1200,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-122.4194, 37.7749],
                [-122.4195, 37.775],
                [-122.4197, 37.7751]
              ]
            }
          }
        ],
        waypoints: [
          { waypoint_index: 0, location: [-122.4194, 37.7749] },
          { waypoint_index: 1, location: [-122.4195, 37.775] },
          { waypoint_index: 2, location: [-122.4197, 37.7751] }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/optimization?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'optimization',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 },
                  { longitude: -122.4197, latitude: 37.7751 }
                ],
                profile: 'mapbox/driving',
                roundtrip: true
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'optimized-trips/v1/mapbox/driving/'
    );
    expect(String(fetchSpy.mock.calls[0][0])).toContain('geometries=geojson');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('overview=full');
    expect(addSourceSpy).toHaveBeenCalledWith(
      'selffetch-optimization-trip',
      expect.objectContaining({ type: 'geojson' })
    );
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selffetch-optimization-trip' })
    );
    expect(summaryEl?.textContent).toBe('Optimized trip: 10.0 mi, 20 min');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('shows an error for a non-Ok code instead of a broken map', async () => {
    const { sendToolResult, setFetchImpl, errorEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 'NoRoute' })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/optimization?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'optimization',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 }
                ],
                roundtrip: true
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(errorEl?.textContent).toContain('Optimization API error');
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
          ref: 'mapbox://selffetch/optimization?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'optimization',
              params: {
                coordinates: [
                  { longitude: -122.4194, latitude: 37.7749 },
                  { longitude: -122.4195, latitude: 37.775 }
                ],
                profile: 'mapbox/driving/../../evil',
                roundtrip: true
              }
            }
          ]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch optimized trip');
  });
});

describe('mapAppHtml ground location self-fetch', () => {
  it('fetches the place name and draws origin + numbered POI markers from a selfFetch descriptor', async () => {
    const { sendToolResult, setFetchImpl, summaryEl, errorEl } =
      loadScriptSandbox();

    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('geocode/v6/reverse')) {
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                type: 'Feature',
                properties: { name: 'Mission District' },
                geometry: { type: 'Point', coordinates: [-122.419, 37.759] }
              }
            ]
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                name: 'Four Barrel Coffee',
                full_address: '375 Valencia St',
                distance: 120
              },
              geometry: { type: 'Point', coordinates: [-122.421, 37.762] }
            }
          ]
        })
      };
    });
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/ground_location?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'ground_location',
              params: {
                longitude: -122.419,
                latitude: 37.759,
                geocodeTypes: 'neighborhood,locality,place',
                poi: { query: 'coffee', limit: 10 }
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'search/geocode/v6/reverse'
    );
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes('search/searchbox/v1/category/coffee')
      )
    ).toBe(true);
    expect(summaryEl?.textContent).toBe('Mission District');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('only fetches the reverse geocode when no poi query is present', async () => {
    const { sendToolResult, setFetchImpl, summaryEl } = loadScriptSandbox();

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            type: 'Feature',
            properties: { name: 'Mission District' },
            geometry: { type: 'Point', coordinates: [-122.419, 37.759] }
          }
        ]
      })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/ground_location?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'ground_location',
              params: {
                longitude: -122.419,
                latitude: 37.759,
                geocodeTypes: 'neighborhood,locality,place'
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(summaryEl?.textContent).toBe('Mission District');
  });

  it('falls back to lat/lng as the place name when the reverse geocode fails, but still renders', async () => {
    const { sendToolResult, setFetchImpl, summaryEl, errorEl } =
      loadScriptSandbox();

    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/ground_location?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'ground_location',
              params: {
                longitude: -122.419,
                latitude: 37.759,
                geocodeTypes: 'neighborhood,locality,place'
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(summaryEl?.textContent).toBe('37.759, -122.419');
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('never fetches when the selfFetch params are unsafe (missing geocodeTypes)', async () => {
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
          ref: 'mapbox://selffetch/ground_location?data=abc',
          layers: [],
          selfFetch: [
            {
              tool: 'ground_location',
              params: { longitude: -122.419, latitude: 37.759 }
            }
          ]
        }
      }
    });
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorEl?.textContent).toContain('Could not fetch location context');
  });
});
