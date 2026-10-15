// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import * as vm from 'node:vm';
import { createHash } from 'node:crypto';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';
import { buildInlinePayloadRef } from '../../../src/utils/inlinePayloadRef.js';

/**
 * A real Mapbox POI mapbox_id decodes to "urn:mbxpoi:<uuid>" — the panel's
 * fetchPlaceDetailsBatch now filters out anything that doesn't match that
 * shape (see isPlacesApiCompatibleId in mapAppHtml.ts), so a placeholder
 * string like 'poi-1' would silently get filtered out of every test fixture
 * below rather than reach the mocked fetch call.
 */
// A native Places id ("urn:mbxpoi:<uuid>"), with a UUID derived from
// `suffix` so each test's ids are distinct and stable.
const mockPoiId = (suffix: string) => {
  const h = createHash('md5').update(suffix).digest('hex');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  return Buffer.from(`urn:mbxpoi:${uuid}`).toString('base64');
};

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * with just enough of window/document/mapboxgl stubbed to exercise the
 * postMessage protocol handling without a real browser or GL JS. Verifies
 * the ChatGPT fix directly: an inline payload in structuredContent must be
 * used without ever attempting `resources/read` (which ChatGPT's MCP Apps
 * bridge doesn't support at all), while a ref-only result (Claude
 * Desktop, which strips structuredContent) still falls back to it.
 */
function loadScriptSandbox(options?: {
  initialData?: unknown;
  /** A page opened directly (export_map_html_tool), not inside a host. */
  topLevel?: boolean;
  /** Framed by a page that isn't an MCP host, so ui/initialize gets no answer. */
  noHost?: boolean;
}) {
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

  // A minimal stand-in for a DOM Element — enough for the panel code's
  // createElement/appendChild/removeChild/addEventListener usage, without
  // pulling in jsdom for a hand-rolled vm sandbox. `__fireClick` is a
  // test-only convenience (not a real DOM API) for simulating a panel row
  // click without constructing a real Event object.
  function fakeElement() {
    const children: FakeElement[] = [];
    const clickListeners: Array<() => void> = [];
    const el: FakeElement = {
      style: {} as Record<string, string>,
      textContent: '',
      className: '',
      attributes: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        this.attributes[name] = value;
      },
      children,
      appendChild: (child: FakeElement) => {
        children.push(child);
        return child;
      },
      removeChild: (child: FakeElement) => {
        const idx = children.indexOf(child);
        if (idx !== -1) children.splice(idx, 1);
        return child;
      },
      get firstChild() {
        return children[0];
      },
      addEventListener: (type: string, cb: () => void) => {
        if (type === 'click') clickListeners.push(cb);
      },
      __fireClick: () => clickListeners.forEach((cb) => cb())
    };
    return el;
  }

  interface FakeElement {
    style: Record<string, string>;
    textContent: string;
    className: string;
    attributes: Record<string, string>;
    setAttribute: (name: string, value: string) => void;
    children: FakeElement[];
    appendChild: (child: FakeElement) => FakeElement;
    removeChild: (child: FakeElement) => FakeElement;
    readonly firstChild: FakeElement | undefined;
    addEventListener: (type: string, cb: () => void) => void;
    __fireClick: () => void;
  }

  // The script fetches each element by id exactly once at load time and
  // keeps the reference, so returning the same object per id lets tests
  // inspect state (e.g. errorEl.textContent) after the fact.
  const elementsById: Record<string, ReturnType<typeof fakeElement>> = {};
  // Seeded before the script runs so initMap()'s synchronous
  // readInitialData() call (used to pass baseMapConfig into the Map
  // constructor's `config` option) sees it, mirroring the real
  // #initial-data script tag renderMapAppHtml embeds when `initialData`
  // is passed to it server-side.
  if (options?.initialData !== undefined) {
    elementsById['initial-data'] = {
      ...fakeElement(),
      textContent: JSON.stringify(options.initialData)
    };
  }
  function getElementById(id: string) {
    if (!elementsById[id]) elementsById[id] = fakeElement();
    return elementsById[id];
  }

  const mapConstructorCalls: Array<Record<string, unknown>> = [];
  const markerConstructorCalls: Array<Record<string, unknown>> = [];
  const setStyleCalls: string[] = [];
  const fitBoundsCalls: Array<{ padding: Record<string, number> }> = [];
  // What's currently on the style, like GL JS: setStyle() drops it all.
  const styleSources: Record<string, Record<string, unknown>> = {};
  const styleLayers: Record<string, Record<string, unknown>> = {};
  const controls: FakeElement[] = [];
  const topLeftCorner = fakeElement();
  const fakeMapInstance = {
    // GL JS calls a control's onAdd right away and mounts what it returns.
    addControl: (control: { onAdd?: (map: unknown) => FakeElement }) => {
      if (control && typeof control.onAdd === 'function') {
        controls.push(control.onAdd(fakeMapInstance));
      }
    },
    getContainer: () => ({
      querySelector: (selector: string) =>
        selector === '.mapboxgl-ctrl-top-left' ? topLeftCorner : null
    }),
    on: (event: string, cb: () => void) => {
      if (event === 'load') cb();
    },
    // Mirrors GL JS's setStyle(...) followed by a 'style.load' event once
    // the new style is ready -- fired synchronously here since the test
    // sandbox doesn't need to simulate the real network round-trip.
    once: (event: string, cb: () => void) => {
      if (event === 'style.load') cb();
    },
    setStyle: (styleUrl: string) => {
      setStyleCalls.push(styleUrl);
      for (const id of Object.keys(styleSources)) delete styleSources[id];
      for (const id of Object.keys(styleLayers)) delete styleLayers[id];
    },
    addSource: (id: string, source: Record<string, unknown>) => {
      styleSources[id] = source;
    },
    addLayer: (layer: Record<string, unknown>) => {
      styleLayers[layer.id as string] = layer;
    },
    getLayer: (id: string) => styleLayers[id] ?? null,
    getSource: (id: string) => styleSources[id] ?? null,
    removeLayer: (id: string) => {
      delete styleLayers[id];
    },
    removeSource: (id: string) => {
      delete styleSources[id];
    },
    fitBounds: (
      _bounds: unknown,
      opts: { padding: Record<string, number> }
    ) => {
      fitBoundsCalls.push(opts);
    },
    flyTo: () => {},
    resize: () => {}
  };

  // Every `new mapboxgl.Marker()` call below returns this same shared
  // object — fine for assertions on setPopup/getLngLat calls in aggregate,
  // but tests can't distinguish *which* marker a call came from by
  // identity. None of the panel tests need to.
  const fakeMarkerInstance = {
    setLngLat: () => fakeMarkerInstance,
    addTo: () => fakeMarkerInstance,
    setPopup: () => fakeMarkerInstance,
    getLngLat: () => ({ lng: 1, lat: 2 }),
    remove: () => {}
  };

  // Overridable per-test; self-fetch tests replace this with a vi.fn(). Must
  // forward `init` too — the Place Details batch call is a POST with a JSON
  // body, unlike every other self-fetch call, which is GET-only.
  let fetchImpl: (url: string, init?: unknown) => Promise<unknown> = () =>
    Promise.resolve({ ok: false, status: 599, json: async () => ({}) });

  // Captures the text passed to the most recent `new mapboxgl.Popup().setText(...)`
  // call, so tests can verify Place Details enrichment (phone number) reaches
  // a marker's popup without needing per-marker identity (fakeMarkerInstance
  // is shared across every `new mapboxgl.Marker()` call).
  let lastPopupText: string | undefined;

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
      Map: function Map(mapOptions: Record<string, unknown>) {
        mapConstructorCalls.push(mapOptions);
        return fakeMapInstance;
      },
      NavigationControl: function NavigationControl() {},
      Marker: function Marker(options?: Record<string, unknown>) {
        markerConstructorCalls.push(options ?? {});
        return fakeMarkerInstance;
      },
      Popup: function Popup() {
        return {
          setText: (text: string) => {
            lastPopupText = text;
            return {};
          }
        };
      }
    },
    console,
    setTimeout,
    URLSearchParams,
    atob,
    fetch: (url: string, init?: unknown) => fetchImpl(url, init)
  };
  if (options?.topLevel) {
    // In a real browser, a page with no host is its own parent.
    const win = sandbox.window as Record<string, unknown>;
    win.postMessage = (win.parent as { postMessage: unknown }).postMessage;
    win.parent = win;
  }
  if (options?.topLevel || options?.noHost) {
    // Loads any image whose URL doesn't contain "403"; never fires onerror.
    sandbox.Image = class {
      onload: (() => void) | null = null;
      set src(url: string) {
        if (!url.includes('403')) Promise.resolve().then(() => this.onload?.());
      }
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  // Resolve the initial `ui/initialize` request so the app proceeds past
  // its handshake (mirrors what a real host would respond with).
  const initId = postMessageCalls.find((m) => m.method === 'ui/initialize')
    ?.id as number | undefined;
  if (initId !== undefined && messageListener && !options?.noHost) {
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
    setFetchImpl: (impl: (url: string, init?: unknown) => Promise<unknown>) => {
      fetchImpl = impl;
    },
    getLastPopupText: () => lastPopupText,
    postMessageCalls,
    map: fakeMapInstance,
    marker: fakeMarkerInstance,
    mapConstructorCalls,
    markerConstructorCalls,
    setStyleCalls,
    styleSources,
    styleLayers,
    controls,
    topLeftCorner,
    legendEl: getElementById('legend') as unknown as {
      innerHTML?: string;
      style: Record<string, string>;
    },
    errorEl: elementsById.error,
    summaryEl: elementsById.summary,
    sidePanelEl: getElementById('side-panel'),
    mapEl: getElementById('map') as unknown as { clientWidth?: number },
    fitBoundsCalls,
    derivePanelItems: (
      sandbox.window as {
        __derivePanelItems?: (markers: unknown[]) => PanelItem[];
      }
    ).__derivePanelItems
  };
}

interface PanelItem {
  id: string;
  number: number;
  name: string;
  category?: string;
  distanceMeters?: number;
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

describe('mapAppHtml baseMapConfig and slot', () => {
  it('seeds baseMapConfig into the Map constructor config option, from initial data', () => {
    const { mapConstructorCalls } = loadScriptSandbox({
      initialData: {
        layers: [],
        baseMapConfig: { colorWater: '#ff0000' }
      }
    });

    expect(mapConstructorCalls).toHaveLength(1);
    expect(mapConstructorCalls[0].config).toEqual({
      basemap: { colorWater: '#ff0000' }
    });
  });

  it('omits the config option from the Map constructor when there is no initial baseMapConfig', () => {
    const { mapConstructorCalls } = loadScriptSandbox();

    expect(mapConstructorCalls).toHaveLength(1);
    expect(mapConstructorCalls[0].config).toBeUndefined();
  });

  it('applies each baseMapConfig key via map.setConfigProperty on render', () => {
    const { sendToolResult, map } = loadScriptSandbox();
    const setConfigPropertySpy = vi.fn();
    (map as { setConfigProperty?: unknown }).setConfigProperty =
      setConfigPropertySpy;

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
          layers: [],
          baseMapConfig: { colorWater: '#ff0000', lightPreset: 'night' }
        }
      }
    });

    expect(setConfigPropertySpy).toHaveBeenCalledWith(
      'basemap',
      'colorWater',
      '#ff0000'
    );
    expect(setConfigPropertySpy).toHaveBeenCalledWith(
      'basemap',
      'lightPreset',
      'night'
    );
  });

  it('does not throw when the map has no setConfigProperty (e.g. a non-Standard base style)', () => {
    const { sendToolResult, map } = loadScriptSandbox();
    delete (map as { setConfigProperty?: unknown }).setConfigProperty;

    expect(() =>
      sendToolResult({
        structuredContent: {
          mapboxRender: {
            ref: 'mapbox://temp/map-payload-abc',
            layers: [],
            baseMapConfig: { colorWater: '#ff0000' }
          }
        }
      })
    ).not.toThrow();
  });

  it('defaults to the standard style when no baseStyle is provided', () => {
    const { mapConstructorCalls } = loadScriptSandbox();

    expect(mapConstructorCalls).toHaveLength(1);
    expect(mapConstructorCalls[0].style).toBe(
      'mapbox://styles/mapbox/standard'
    );
  });

  it('loads the standard-satellite style when baseStyle is set in initial data', () => {
    const { mapConstructorCalls } = loadScriptSandbox({
      initialData: {
        layers: [],
        baseStyle: 'standard-satellite'
      }
    });

    expect(mapConstructorCalls).toHaveLength(1);
    expect(mapConstructorCalls[0].style).toBe(
      'mapbox://styles/mapbox/standard-satellite'
    );
  });

  it('falls back to standard for an unrecognized baseStyle value rather than interpolating it', () => {
    const { mapConstructorCalls } = loadScriptSandbox({
      initialData: {
        layers: [],
        baseStyle: 'not-a-real-style; </script>'
      }
    });

    expect(mapConstructorCalls).toHaveLength(1);
    expect(mapConstructorCalls[0].style).toBe(
      'mapbox://styles/mapbox/standard'
    );
  });

  it('switches base style via map.setStyle when baseStyle arrives in a render (not initial data) -- the real-world path, since MapAppUIResource never seeds initial data server-side', () => {
    const { sendToolResult, setStyleCalls } = loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
          layers: [],
          baseStyle: 'standard-satellite'
        }
      }
    });

    expect(setStyleCalls).toEqual([
      'mapbox://styles/mapbox/standard-satellite'
    ]);
  });

  it('does not call setStyle when a render repeats the style the map is already on', () => {
    const { sendToolResult, setStyleCalls } = loadScriptSandbox({
      initialData: { layers: [], baseStyle: 'standard-satellite' }
    });

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
          layers: [],
          baseStyle: 'standard-satellite'
        }
      }
    });

    expect(setStyleCalls).toEqual([]);
  });

  it('passes a layer slot through to map.addLayer', () => {
    const { sendToolResult, map } = loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
          layers: [
            {
              id: 'route',
              type: 'line',
              slot: 'top',
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

    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'route', slot: 'top' })
    );
  });

  it('omits slot from the addLayer call when not provided (default behavior unchanged)', () => {
    const { sendToolResult, map } = loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://temp/map-payload-abc',
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

    const callArg = addLayerSpy.mock.calls[0][0] as { slot?: unknown };
    expect(callArg.slot).toBeUndefined();
  });
});

describe('mapAppHtml Satellite and Traffic toggles', () => {
  const routeLayer = {
    id: 'route',
    type: 'line',
    slot: 'top',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4, 37.78],
          [-122.41, 37.79]
        ]
      }
    }
  };

  function sendPayload(
    sandbox: ReturnType<typeof loadScriptSandbox>,
    payload: Record<string, unknown>
  ) {
    sandbox.sendToolResult({
      structuredContent: { mapboxRender: { layers: [], ...payload } }
    });
  }

  function buttons(sandbox: ReturnType<typeof loadScriptSandbox>) {
    expect(sandbox.controls).toHaveLength(1);
    const [satellite, traffic] = sandbox.controls[0].children;
    return { satellite, traffic };
  }

  it('adds Satellite and Traffic buttons under the zoom control, both off', () => {
    const sandbox = loadScriptSandbox();
    const { satellite, traffic } = buttons(sandbox);

    expect(sandbox.controls[0].className).toContain('mapboxgl-ctrl-group');
    expect(satellite.attributes['aria-label']).toBe('Satellite view');
    expect(traffic.attributes['aria-label']).toBe('Live traffic');
    expect(satellite.attributes['aria-pressed']).toBe('false');
    expect(traffic.attributes['aria-pressed']).toBe('false');
  });

  it('the Traffic button adds live congestion under labels and adds it to the legend', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, { layers: [routeLayer] });
    const { traffic } = buttons(sandbox);

    traffic.__fireClick();

    expect(sandbox.styleSources['mapbox-live-traffic']).toEqual({
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-traffic-v1'
    });
    const layer = sandbox.styleLayers['mapbox-live-traffic'];
    expect(layer).toMatchObject({
      type: 'line',
      'source-layer': 'traffic',
      slot: 'middle'
    });
    expect((layer.paint as Record<string, unknown>)['line-color']).toContain(
      'severe'
    );
    // Light traffic only on main roads; slowdowns on every road.
    const filter = JSON.stringify(layer.filter);
    expect(filter).toContain('["!=",["get","congestion"],"low"]');
    expect(filter).toContain('"primary"');
    expect(filter).not.toContain('"street"');
    expect(traffic.attributes['aria-pressed']).toBe('true');
    expect(traffic.className).toBe('active');
    expect(sandbox.legendEl.style.display).toBe('block');
    expect(sandbox.legendEl.innerHTML).toContain('Heavy traffic');

    traffic.__fireClick();

    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeUndefined();
    expect(sandbox.styleSources['mapbox-live-traffic']).toBeUndefined();
    expect(traffic.attributes['aria-pressed']).toBe('false');
    expect(sandbox.legendEl.style.display).toBe('none');
  });

  it('keeps the payload legend rows alongside the traffic ones', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, {
      layers: [routeLayer],
      legend: [{ color: '#3b82f6', label: 'Route' }]
    });

    buttons(sandbox).traffic.__fireClick();

    expect(sandbox.legendEl.innerHTML).toContain('Route');
    expect(sandbox.legendEl.innerHTML).toContain('Light traffic');
  });

  it('the Satellite button switches style and puts back the drawn layers and traffic, without moving the camera', async () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, { layers: [routeLayer] });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const fitsBefore = sandbox.fitBoundsCalls.length;
    const { satellite, traffic } = buttons(sandbox);
    traffic.__fireClick();

    satellite.__fireClick();

    expect(sandbox.setStyleCalls).toEqual([
      'mapbox://styles/mapbox/standard-satellite'
    ]);
    expect(sandbox.styleLayers.route).toMatchObject({
      type: 'line',
      source: 'route',
      slot: 'top'
    });
    expect(sandbox.styleSources.route).toMatchObject({ type: 'geojson' });
    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeDefined();
    expect(satellite.attributes['aria-pressed']).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(sandbox.fitBoundsCalls.length).toBe(fitsBefore);

    satellite.__fireClick();

    expect(sandbox.setStyleCalls[1]).toBe('mapbox://styles/mapbox/standard');
    expect(sandbox.styleLayers.route).toBeDefined();
    expect(satellite.attributes['aria-pressed']).toBe('false');
  });

  it('reapplies the base map config after the Satellite button switches style', () => {
    const sandbox = loadScriptSandbox();
    const setConfigProperty = vi.fn();
    (sandbox.map as { setConfigProperty?: unknown }).setConfigProperty =
      setConfigProperty;
    sendPayload(sandbox, {
      baseMapConfig: { showPointOfInterestLabels: false }
    });
    setConfigProperty.mockClear();

    buttons(sandbox).satellite.__fireClick();

    expect(setConfigProperty).toHaveBeenCalledWith(
      'basemap',
      'showPointOfInterestLabels',
      false
    );
  });

  it('a baseStyle from the model updates the Satellite button', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, { baseStyle: 'standard-satellite' });

    expect(buttons(sandbox).satellite.attributes['aria-pressed']).toBe('true');
  });

  it('showTraffic: true turns traffic on, and a later render without it keeps it on', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, { layers: [routeLayer], showTraffic: true });

    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeDefined();
    expect(buttons(sandbox).traffic.attributes['aria-pressed']).toBe('true');

    sendPayload(sandbox, { layers: [routeLayer] });
    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeDefined();

    sendPayload(sandbox, { layers: [routeLayer], showTraffic: false });
    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeUndefined();
  });

  it('keeps traffic on when the model switches base style', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, { layers: [routeLayer], showTraffic: true });

    sendPayload(sandbox, {
      layers: [routeLayer],
      baseStyle: 'standard-satellite'
    });

    expect(sandbox.setStyleCalls).toEqual([
      'mapbox://styles/mapbox/standard-satellite'
    ]);
    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeDefined();
    expect(sandbox.styleLayers.route).toBeDefined();
  });

  it('moves the top-left controls below the summary chip while it shows', () => {
    const sandbox = loadScriptSandbox();
    (sandbox.summaryEl as unknown as { offsetHeight: number }).offsetHeight =
      30;

    sendPayload(sandbox, { summary: 'Downtown traffic' });
    expect(sandbox.topLeftCorner.style.top).toBe('38px');

    sendPayload(sandbox, { layers: [routeLayer] });
    expect(sandbox.topLeftCorner.style.top).toBe('');
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
  it('shows and enriches the results panel for nearby POI results that carry a mapbox_id', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    const coffeeId = mockPoiId('four-barrel');

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
      if (url.includes('places/v1/details/retrieve')) {
        return {
          ok: true,
          json: async () => ({
            results: [{ mapbox_id: coffeeId, score: { popularity: 0.65 } }]
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
                mapbox_id: coffeeId,
                poi_category: ['cafe'],
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

    expect(sidePanelEl.style.display).toBe('flex');
    const [badge, body] = sidePanelEl.children[1].children[0].children;
    expect(badge.textContent).toBe('1');
    expect(body.children[0].textContent).toBe('Four Barrel Coffee');
    expect(body.children[1].textContent).toBe('cafe · 120 m · 65% popularity');
  });

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

describe('mapAppHtml results side panel: derivePanelItems', () => {
  it('keeps only markers with an id, preferring a numeric label as the panel number', () => {
    const { derivePanelItems } = loadScriptSandbox();

    const items = derivePanelItems?.([
      {
        id: 'a',
        label: '3',
        name: 'Alpha',
        category: 'Cafe',
        distanceMeters: 120
      },
      // No id (e.g. a route waypoint marker) — must be dropped, not just
      // rendered without enrichment.
      { label: '1', name: 'No id' },
      // No label — falls back to positional numbering among id-bearing markers.
      { id: 'b', name: 'Beta' }
    ]);

    expect(items).toEqual([
      {
        id: 'a',
        number: 3,
        name: 'Alpha',
        category: 'Cafe',
        distanceMeters: 120
      },
      { id: 'b', number: 2, name: 'Beta' }
    ]);
  });

  it('falls back to "Result N" when name is omitted', () => {
    const { derivePanelItems } = loadScriptSandbox();
    const items = derivePanelItems?.([{ id: 'a', label: '1' }]);
    expect(items?.[0].name).toBe('Result 1');
  });

  it('returns an empty array for non-array input', () => {
    const { derivePanelItems } = loadScriptSandbox();
    expect(derivePanelItems?.(undefined as unknown as unknown[])).toEqual([]);
  });
});

describe('mapAppHtml results side panel: self-fetch (category_search)', () => {
  it('renders the panel from category-search self-fetch results, then enriches it via one batched Place Details call', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, map, getLastPopupText } =
      loadScriptSandbox();
    const flyToSpy = vi.fn();
    map.flyTo = flyToSpy;

    const fetchSpy = vi.fn(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        // Assert the batch call's shape from inside the mock, where the
        // real `init` object (dropped by a naive fetch stub) is available.
        expect(init).toEqual(
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ ids: [mockPoiId('poi-1')] })
          })
        );
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                mapbox_id: mockPoiId('poi-1'),
                photos: [{ url: 'https://example.com/photo.jpg' }],
                score: { popularity: 0.8 },
                phone: '+15551234567'
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
                name: 'Cafe Reveille',
                mapbox_id: mockPoiId('poi-1'),
                poi_category: ['cafe'],
                distance: 120
              },
              geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
            }
          ]
        })
      };
    });
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
    // Two sequential fetches (category search, then the Place Details
    // batch), each chained through a couple of .then()s — matches the
    // ground-location self-fetch test's tick count for the same reason.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(sidePanelEl.style.display).toBe('flex');
    const list = sidePanelEl.children[1];
    expect(list.children).toHaveLength(1);
    const [badge, body] = list.children[0].children;
    const [name, meta] = body.children;

    expect(badge.textContent).toBe('1');
    expect(name.textContent).toBe('Cafe Reveille');
    expect(meta.textContent).toBe('cafe · 120 m · 80% popularity');

    // Clicking the row flies the map to that marker.
    list.children[0].__fireClick();
    expect(flyToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ center: { lng: 1, lat: 2 } })
    );

    // The enriched phone number reaches the marker's popup.
    expect(getLastPopupText()).toBe('1. Cafe Reveille — 120 m — +15551234567');
  });

  it('never renders a panel for markers without a mapbox_id (e.g. a directions route)', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    setFetchImpl(async () => ({
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
            distance: 1000,
            duration: 60
          }
        ]
      })
    }));

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
                ]
              }
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(sidePanelEl.style.display).not.toBe('flex');
  });

  it('leaves the initial Search-Box-only panel row intact when the Place Details call fails (e.g. quota exceeded)', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, errorEl } =
      loadScriptSandbox();
    const fetchSpy = vi.fn(async (url: string) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                name: 'Cafe Reveille',
                mapbox_id: mockPoiId('poi-1')
              },
              geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
            }
          ]
        })
      };
    });
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/category_search?data=abc',
          layers: [],
          selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(sidePanelEl.style.display).toBe('flex');
    const row = sidePanelEl.children[1].children[0];
    expect(row.children[0].className).toBe('panel-badge');
    expect(errorEl?.style.display).not.toBe('block');
  });

  // Two cafes from one category search, for the id-format tests below.
  function twoCafeSearch(badId: string, goodId: string) {
    return {
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Bad Id Cafe', mapbox_id: badId },
            geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
          },
          {
            type: 'Feature',
            properties: { name: 'Good Id Cafe', mapbox_id: goodId },
            geometry: { type: 'Point', coordinates: [-122.42, 37.79] }
          }
        ]
      })
    };
  }
  const cafeSearchResult = {
    structuredContent: {
      mapboxRender: {
        ref: 'mapbox://selffetch/category_search?data=abc',
        layers: [],
        selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
      }
    }
  };

  // Seen live near Union Square, SF: a Starbucks whose id decodes to
  // "urn:mbxpoi:mapbox-n408854" has the native prefix but not a UUID, and
  // the batch endpoint 422'd the whole request for it.
  it('filters out urn:mbxpoi ids that are not UUIDs', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    const badId = Buffer.from('urn:mbxpoi:mapbox-n408854').toString('base64');
    const goodId = mockPoiId('good');
    const bodies: unknown[] = [];
    setFetchImpl(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        bodies.push(JSON.parse((init as { body: string }).body));
        return {
          ok: true,
          json: async () => ({
            results: [{ mapbox_id: goodId, score: { popularity: 0.5 } }]
          })
        };
      }
      return twoCafeSearch(badId, goodId);
    });

    sendToolResult(cafeSearchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(bodies).toEqual([{ ids: [goodId] }]);
    const rows = sidePanelEl.children[1].children;
    expect(rows[1].children[1].children[1].textContent).toBe('50% popularity');
  });

  it('drops the id a 422 names and retries the batch once', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    // Passes the client-side filter, but the API rejects it anyway.
    const rejectedId = mockPoiId('rejected');
    const goodId = mockPoiId('good');
    const bodies: Array<{ ids: string[] }> = [];
    setFetchImpl(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        const body = JSON.parse((init as { body: string }).body);
        bodies.push(body);
        if (body.ids.includes(rejectedId)) {
          return {
            ok: false,
            status: 422,
            json: async () => ({
              message: `Invalid mapbox_id format: ${rejectedId.replace(/=+$/, '')}`
            })
          };
        }
        return {
          ok: true,
          json: async () => ({
            results: [{ mapbox_id: goodId, score: { popularity: 0.5 } }]
          })
        };
      }
      return twoCafeSearch(rejectedId, goodId);
    });

    sendToolResult(cafeSearchResult);
    for (let i = 0; i < 30; i++) await Promise.resolve();

    expect(bodies.map((b) => b.ids)).toEqual([[rejectedId, goodId], [goodId]]);
    const rows = sidePanelEl.children[1].children;
    expect(rows[1].children[1].children[1].textContent).toBe('50% popularity');
  });

  it('filters out OSM-sourced ids before the batch call, so one incompatible id does not zero out enrichment for the rest', async () => {
    // Confirmed live against the real API: a category_search-style query
    // for "cafe" near Herndon, VA returned 2 OSM-sourced ids (decode to
    // "urn:mbxpoi-osm:n<osm-node-id>") among 10 results, and Places API's
    // batch endpoint 422s the ENTIRE request if even one id isn't its
    // native "urn:mbxpoi:<uuid>" scheme — silently zeroing out enrichment
    // for all 10, not just the 2 bad ones, before this filter existed.
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    const osmId = Buffer.from('urn:mbxpoi-osm:n2678573672').toString('base64');
    const nativeId = mockPoiId('poi-native');

    const fetchSpy = vi.fn(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        // Proves the OSM id never reached the request that would have
        // 422'd the whole batch.
        expect(JSON.parse((init as { body: string }).body)).toEqual({
          ids: [nativeId]
        });
        return {
          ok: true,
          json: async () => ({
            results: [{ mapbox_id: nativeId, score: { popularity: 0.5 } }]
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
              properties: { name: 'OSM Cafe', mapbox_id: osmId },
              geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
            },
            {
              type: 'Feature',
              properties: { name: 'Native Cafe', mapbox_id: nativeId },
              geometry: { type: 'Point', coordinates: [-122.42, 37.79] }
            }
          ]
        })
      };
    });
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/category_search?data=abc',
          layers: [],
          selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Both rows still render — only enrichment eligibility differs.
    const rows = sidePanelEl.children[1].children;
    expect(rows).toHaveLength(2);
    expect(rows[0].children[1].children[0].textContent).toBe('OSM Cafe');
    // Never enriched (filtered out before the batch call).
    expect(rows[0].children[1].children[1].textContent).not.toContain(
      'popularity'
    );

    expect(rows[1].children[1].children[0].textContent).toBe('Native Cafe');
    expect(rows[1].children[1].children[1].textContent).toBe('50% popularity');
  });

  // Place Details photos are hosted on third-party CDNs (e.g.
  // dyn.mktgcdn.com), which the map app's CSP doesn't allow images from. In a
  // host, the page reads them through the server (PlacePhotoResource) instead.
  function photoFetch(id: string) {
    return async (url: string) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                mapbox_id: id,
                photos: [{ url: 'https://dyn.mktgcdn.com/p/photo.jpg' }],
                score: { popularity: 0.42 }
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
              properties: { name: 'Photo Cafe', mapbox_id: id },
              geometry: { type: 'Point', coordinates: [-122.41, 37.78] }
            }
          ]
        })
      };
    };
  }
  const searchResult = {
    structuredContent: {
      mapboxRender: {
        ref: 'mapbox://selffetch/category_search?data=abc',
        layers: [],
        selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
      }
    }
  };

  it('loads a photo through the server and shows it as a data: URL', async () => {
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      postMessageCalls,
      resolveResourcesRead
    } = loadScriptSandbox();
    const id = mockPoiId('photo-poi');
    setFetchImpl(photoFetch(id));

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const reads = postMessageCalls.filter((m) => m.method === 'resources/read');
    expect(reads).toHaveLength(1);
    expect(reads[0].params).toEqual({
      uri: 'mapbox://place-photo/' + encodeURIComponent(id)
    });
    // The CDN URL is never used directly.
    const row = sidePanelEl.children[1].children[0];
    expect(row.children).toHaveLength(2);

    resolveResourcesRead({
      contents: [{ uri: 'x', mimeType: 'image/jpeg', blob: 'QUJD' }]
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // At the end of the row, so badge and name stay where they were.
    const [badge, body, thumb] = row.children;
    expect(thumb.className).toBe('panel-thumb');
    expect(thumb.style.backgroundImage).toBe(
      'url("data:image/jpeg;base64,QUJD")'
    );
    expect(badge.textContent).toBe('1');
    expect(body.children[1].textContent).toBe('42% popularity');
    expect(JSON.stringify(row)).not.toContain('mktgcdn');
  });

  it('adds no thumbnail when the server has no photo', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, resolveResourcesRead } =
      loadScriptSandbox();
    setFetchImpl(photoFetch(mockPoiId('photo-poi')));

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    resolveResourcesRead({
      contents: [{ uri: 'x', mimeType: 'text/plain', text: 'No photo' }]
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(sidePanelEl.children[1].children[0].children).toHaveLength(2);
  });

  it('loads the photo URL directly on a standalone page, which has no host or CSP', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, postMessageCalls } =
      loadScriptSandbox({ topLevel: true });
    setFetchImpl(photoFetch(mockPoiId('photo-poi')));

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      false
    );
    const [, , thumb] = sidePanelEl.children[1].children[0].children;
    expect(thumb.className).toBe('panel-thumb');
    expect(thumb.style.backgroundImage).toBe(
      'url("https://dyn.mktgcdn.com/p/photo.jpg")'
    );
  });

  it('adds no thumbnail on a standalone page when the photo fails to load', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox({
      topLevel: true
    });
    const id = mockPoiId('photo-poi');
    const base = photoFetch(id);
    setFetchImpl(async (url: string) => {
      const res = (await base(url)) as {
        json: () => Promise<{ results?: unknown[] }>;
      };
      if (!String(url).includes('places/v1/details/retrieve')) return res;
      return {
        ok: true,
        json: async () => ({
          results: [
            { mapbox_id: id, photos: [{ url: 'https://example.com/403.jpg' }] }
          ]
        })
      };
    });

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(sidePanelEl.children[1].children[0].children).toHaveLength(2);
  });
});

describe('mapAppHtml results side panel: inline markers', () => {
  it('renders and enriches the panel from inline markers that carry an id, with no selfFetch entries at all', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));
    setFetchImpl(fetchSpy);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/abc',
          summary: 'Coffee shops near Herndon, VA',
          layers: [],
          markers: [
            {
              coordinates: [-77.386, 38.9695],
              style: 'numbered',
              label: '1',
              id: mockPoiId('poi-inline-1'),
              name: 'Starbucks',
              category: 'Coffee Shop',
              distanceMeters: 400
            },
            // A route/waypoint-style marker with no id must not get a row.
            { coordinates: [-77.4, 38.97], style: 'start' }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(sidePanelEl.style.display).toBe('flex');
    expect(sidePanelEl.children[0].textContent).toBe(
      'Coffee shops near Herndon, VA'
    );
    const list = sidePanelEl.children[1];
    expect(list.children).toHaveLength(1);
    const [badge, body] = list.children[0].children;
    expect(badge.textContent).toBe('1');
    expect(body.children[0].textContent).toBe('Starbucks');
    expect(body.children[1].textContent).toBe('Coffee Shop · 400 m');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain(
      'places/v1/details/retrieve'
    );
  });

  it('auto-promotes an id-bearing marker with no explicit style/label to a numbered badge, matching its panel row', async () => {
    // Observed live: Claude built inline POI markers as plain unlabeled
    // pins (default style, no label), so the map showed generic blue dots
    // with no way to tell which one corresponded to which panel row. The
    // panel's own numbering (positional, independent of what's drawn)
    // still worked, but nothing on the map matched it.
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      markerConstructorCalls
    } = loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/abc',
          layers: [],
          markers: [
            {
              coordinates: [-77.386, 38.9695],
              id: mockPoiId('poi-plain-1'),
              name: 'Starbucks'
            },
            {
              coordinates: [-77.4, 38.97],
              id: mockPoiId('poi-plain-2'),
              name: 'Panera Bread'
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Both markers got promoted to the numbered-badge element path
    // (buildBadgeElement), not the default plain-color pin path.
    expect(markerConstructorCalls).toHaveLength(2);
    const el1 = markerConstructorCalls[0].element as {
      textContent: string;
      style: Record<string, string>;
    };
    const el2 = markerConstructorCalls[1].element as {
      textContent: string;
      style: Record<string, string>;
    };
    expect(el1.textContent).toBe('1');
    expect(el1.style.background).toBe('#f97316');
    expect(el2.textContent).toBe('2');

    // And the panel's badges show the exact same numbers.
    const rows = sidePanelEl.children[1].children;
    expect(rows[0].children[0].textContent).toBe('1');
    expect(rows[1].children[0].textContent).toBe('2');
  });

  it('never renders a panel when no inline marker carries an id', () => {
    const { sendToolResult, sidePanelEl } = loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/abc',
          layers: [],
          markers: [{ coordinates: [-77, 38], style: 'pin' }]
        }
      }
    });

    expect(sidePanelEl.style.display).not.toBe('flex');
  });

  it("replaces the previous render's panel rather than accumulating rows across renders", async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));

    const markerFor = (id: string, name: string) => ({
      coordinates: [-77.386, 38.9695] as [number, number],
      style: 'numbered' as const,
      label: '1',
      id,
      name
    });

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/a',
          layers: [],
          markers: [markerFor(mockPoiId('poi-1'), 'First')]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(sidePanelEl.children[1].children).toHaveLength(1);

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/b',
          layers: [],
          markers: [markerFor(mockPoiId('poi-2'), 'Second')]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const list = sidePanelEl.children[1];
    expect(list.children).toHaveLength(1);
    expect(list.children[0].children[1].children[0].textContent).toBe('Second');
  });
});

// From Chris's review of #262 (2026-10-14).
describe('mapAppHtml results side panel: one panel per render', () => {
  const at = (lng: number) => [lng, 37.78] as [number, number];
  const labelsDrawn = (calls: Array<Record<string, unknown>>) =>
    calls
      .map(
        (c) => (c.element as { textContent?: string } | undefined)?.textContent
      )
      .filter((t): t is string => typeof t === 'string' && t !== '');
  const rowNames = (panel: { children: Array<{ children: unknown[] }> }) =>
    (
      panel.children[1] as unknown as {
        children: Array<{
          children: Array<{ children: Array<{ textContent: string }> }>;
        }>;
      }
    ).children.map((row) => row.children[1].children[0].textContent);

  it('numbers inline markers and merged search results as one list', async () => {
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      markerConstructorCalls
    } = loadScriptSandbox();
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((x) =>
      mockPoiId('one-list-' + x)
    );
    const detailsBodies: string[][] = [];
    setFetchImpl(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        detailsBodies.push(JSON.parse((init as { body: string }).body).ids);
        return { ok: true, json: async () => ({ results: [] }) };
      }
      const feature = (id: string, name: string, lng: number) => ({
        type: 'Feature',
        properties: { name, mapbox_id: id },
        geometry: { type: 'Point', coordinates: at(lng) }
      });
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          // "A" is also an inline marker, so it must not be listed twice.
          features: [
            feature(c, 'C', -122.43),
            feature(a, 'A', -122.41),
            feature(d, 'D', -122.44)
          ]
        })
      };
    });

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: [
            {
              coordinates: at(-122.41),
              id: a,
              name: 'A',
              label: '1',
              style: 'numbered'
            },
            {
              coordinates: at(-122.42),
              id: b,
              name: 'B',
              label: '2',
              style: 'numbered'
            }
          ],
          selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(labelsDrawn(markerConstructorCalls)).toEqual(['1', '2', '3', '4']);
    expect(rowNames(sidePanelEl)).toEqual(['A', 'B', 'C', 'D']);
    // Each place is looked up once.
    expect(detailsBodies).toEqual([
      [a, b],
      [c, d]
    ]);
  });

  it('ignores a Place Details response from an earlier render', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    const id = mockPoiId('stale');
    const pending: Array<(v: unknown) => void> = [];
    setFetchImpl(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        })
    );
    const render = () =>
      sendToolResult({
        structuredContent: {
          mapboxRender: {
            ref: 'mapbox://inline/x',
            layers: [],
            markers: [{ coordinates: at(-122.41), id, name: 'Cafe' }]
          }
        }
      });

    render();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    render();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(pending).toHaveLength(2);

    const respond = (resolve: (v: unknown) => void) =>
      resolve({
        ok: true,
        json: async () => ({
          results: [{ mapbox_id: id, score: { popularity: 0.45 } }]
        })
      });
    respond(pending[0]);
    respond(pending[1]);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const row = (
      sidePanelEl.children[1] as unknown as {
        children: Array<{
          children: Array<{ children: Array<{ textContent: string }> }>;
        }>;
      }
    ).children[0];
    expect(row.children[1].children[1].textContent).toBe('45% popularity');
  });

  it('fits the map beside an open panel, and refits when it is collapsed', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, fitBoundsCalls } =
      loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: [
            { coordinates: at(-122.41), id: mockPoiId('fit-1'), name: 'One' },
            { coordinates: at(-122.42), id: mockPoiId('fit-2'), name: 'Two' }
          ]
        }
      }
    });
    await new Promise((r) => setTimeout(r, 80));
    // 280px panel + 24px gap.
    expect(fitBoundsCalls.at(-1)?.padding.right).toBe(304);

    (
      sidePanelEl.children[0] as unknown as { __fireClick: () => void }
    ).__fireClick();
    expect(sidePanelEl.className).toBe('collapsed');
    await new Promise((r) => setTimeout(r, 80));
    expect(fitBoundsCalls.at(-1)?.padding.right).toBe(30);
  });

  it('starts collapsed on a narrow map', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, mapEl, fitBoundsCalls } =
      loadScriptSandbox();
    mapEl.clientWidth = 400;
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: [
            {
              coordinates: at(-122.41),
              id: mockPoiId('narrow-1'),
              name: 'One'
            },
            { coordinates: at(-122.42), id: mockPoiId('narrow-2'), name: 'Two' }
          ]
        }
      }
    });
    await new Promise((r) => setTimeout(r, 80));

    expect(sidePanelEl.className).toBe('collapsed');
    expect(fitBoundsCalls.at(-1)?.padding.right).toBe(30);
  });

  it("colors a row's badge like its pin when the caller set a color", async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl } = loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: [
            {
              coordinates: at(-122.41),
              id: mockPoiId('color-1'),
              name: 'Gray',
              color: '#6b7280'
            },
            {
              coordinates: at(-122.42),
              id: mockPoiId('color-2'),
              name: 'Default'
            },
            {
              coordinates: at(-122.43),
              id: mockPoiId('color-3'),
              name: 'Bad',
              color: 'red;x:y'
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const badges = (
      sidePanelEl.children[1] as unknown as {
        children: Array<{ children: Array<{ style: Record<string, string> }> }>;
      }
    ).children.map((row) => row.children[0].style.background);
    expect(badges).toEqual(['#6b7280', undefined, undefined]);
  });
});

describe('mapAppHtml results side panel: caller labels', () => {
  const at = (lng: number) => [lng, 37.78] as [number, number];
  const badges = (panel: { children: unknown[] }) =>
    (
      panel.children[1] as {
        children: Array<{ children: Array<{ textContent: string }> }>;
      }
    ).children.map((row) => row.children[0].textContent);
  const labelsDrawn = (calls: Array<Record<string, unknown>>) =>
    calls.map(
      (c) => (c.element as { textContent?: string } | undefined)?.textContent
    );
  const render = (markers: Array<Record<string, unknown>>) => ({
    structuredContent: {
      mapboxRender: { ref: 'mapbox://inline/x', layers: [], markers }
    }
  });
  const noDetails = async () => ({
    ok: true,
    json: async () => ({ results: [] })
  });

  it("keeps the caller's own numbers when they're unique, such as a visit order", async () => {
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      markerConstructorCalls
    } = loadScriptSandbox();
    setFetchImpl(noDetails);
    sendToolResult(
      render(
        ['3', '1', '2'].map((label, i) => ({
          coordinates: at(-122.41 - i / 100),
          id: mockPoiId('visit-' + label),
          name: 'Stop ' + label,
          label,
          style: 'numbered'
        }))
      )
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(labelsDrawn(markerConstructorCalls)).toEqual(['3', '1', '2']);
    expect(badges(sidePanelEl)).toEqual(['3', '1', '2']);
  });

  it('renumbers repeated numbers so each pin matches one row', async () => {
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      markerConstructorCalls
    } = loadScriptSandbox();
    setFetchImpl(noDetails);
    sendToolResult(
      render(
        ['1', '1', '2'].map((label, i) => ({
          coordinates: at(-122.41 - i / 100),
          id: mockPoiId('repeat-' + i),
          name: 'Place ' + i,
          label,
          style: 'numbered'
        }))
      )
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(labelsDrawn(markerConstructorCalls)).toEqual(['1', '2', '3']);
    expect(badges(sidePanelEl)).toEqual(['1', '2', '3']);
  });

  it('shows a letter label in the panel row, as on its pin', async () => {
    const {
      sendToolResult,
      setFetchImpl,
      sidePanelEl,
      markerConstructorCalls
    } = loadScriptSandbox();
    setFetchImpl(noDetails);
    sendToolResult(
      render([
        {
          coordinates: at(-122.41),
          id: mockPoiId('letter-a'),
          name: 'Home',
          label: 'A',
          style: 'numbered'
        },
        { coordinates: at(-122.42), id: mockPoiId('letter-b'), name: 'Cafe' }
      ])
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(labelsDrawn(markerConstructorCalls)).toEqual(['A', '1']);
    expect(badges(sidePanelEl)).toEqual(['A', '1']);
  });
});

describe('mapAppHtml results side panel: photos without an MCP host', () => {
  it('loads photos directly when framed by a page that never answers ui/initialize', async () => {
    const { sendToolResult, setFetchImpl, sidePanelEl, postMessageCalls } =
      loadScriptSandbox({ noHost: true });
    const id = mockPoiId('framed-photo');
    setFetchImpl(async (url: string) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              { mapbox_id: id, photos: [{ url: 'https://example.com/a.jpg' }] }
            ]
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: [{ coordinates: [-122.41, 37.78], id, name: 'Framed Cafe' }]
        }
      }
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      false
    );
    const row = (
      sidePanelEl.children[1] as {
        children: Array<{
          children: Array<{ className: string; style: Record<string, string> }>;
        }>;
      }
    ).children[0];
    expect(row.children[2].className).toBe('panel-thumb');
    expect(row.children[2].style.backgroundImage).toBe(
      'url("https://example.com/a.jpg")'
    );
  });
});
