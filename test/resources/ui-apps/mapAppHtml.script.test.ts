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
  /** hostContext the host answers ui/initialize with. */
  hostContext?: Record<string, unknown>;
  /** The system's prefers-color-scheme: dark, when set. */
  systemDark?: boolean;
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
  let messageListener:
    | ((event: { data: unknown; source: unknown }) => void)
    | undefined;

  // A minimal stand-in for a DOM Element — enough for the panel code's
  // createElement/appendChild/removeChild/addEventListener usage, without
  // pulling in jsdom for a hand-rolled vm sandbox. `__fireClick` is a
  // test-only convenience (not a real DOM API) for simulating a card click
  // without constructing a real Event object; `__fire` does the same for
  // any event type (the carousel listens for scroll).
  function fakeElement() {
    const children: FakeElement[] = [];
    const listeners: Record<string, Array<(e?: unknown) => void>> = {};
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
      addEventListener: (type: string, cb: (e?: unknown) => void) => {
        (listeners[type] ??= []).push(cb);
      },
      __fireClick: () => (listeners.click ?? []).forEach((cb) => cb({})),
      __fire: (type: string) => (listeners[type] ?? []).forEach((cb) => cb({}))
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
    addEventListener: (type: string, cb: (e?: unknown) => void) => void;
    __fireClick: () => void;
    __fire: (type: string) => void;
    scrollLeft?: number;
    clientWidth?: number;
    offsetLeft?: number;
    offsetWidth?: number;
    scrollIntoView?: (opts: unknown) => void;
    innerHTML?: string;
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
    getElement: () => lastMarkerElement,
    remove: () => {}
  };
  // The element passed to the most recent `new mapboxgl.Marker()`, which
  // getElement() returns: the script reads it right after constructing.
  let lastMarkerElement: unknown;

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

  // <html>: the theme lands in its data-theme attribute and its style.
  const rootEl = {
    attributes: {} as Record<string, string>,
    cssVars: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    style: {
      setProperty: (name: string, value: string) => {
        rootEl.cssVars[name] = value;
      }
    }
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
      getElementById: getElementById,
      createElement: () => fakeElement(),
      documentElement: rootEl
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
        lastMarkerElement = options?.element;
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
  if (options?.systemDark !== undefined) {
    (sandbox.window as Record<string, unknown>).matchMedia = (q: string) => ({
      matches: q === '(prefers-color-scheme: dark)' && options.systemDark,
      addEventListener: () => {}
    });
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

  const hostWindow = (sandbox.window as { parent: unknown }).parent;
  const postToApp = (data: unknown, source: unknown = hostWindow) =>
    messageListener?.({ data, source });

  // Resolve the initial `ui/initialize` request so the app proceeds past
  // its handshake (mirrors what a real host would respond with).
  const initId = postMessageCalls.find((m) => m.method === 'ui/initialize')
    ?.id as number | undefined;
  if (initId !== undefined && messageListener && !options?.noHost) {
    postToApp({
      jsonrpc: '2.0',
      id: initId,
      result: options?.hostContext ? { hostContext: options.hostContext } : {}
    });
  }

  return {
    sendToolResult: (result: unknown, source?: unknown) => {
      postToApp(
        {
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: result
        },
        source
      );
    },
    // Resolves the most recent still-pending resources/read request with
    // the given JSON-RPC `result`, mirroring what the real host does after
    // the iframe asks to dereference a payload ref.
    resolveResourcesRead: (result: unknown, source?: unknown) => {
      const call = [...postMessageCalls]
        .reverse()
        .find((m) => m.method === 'resources/read');
      if (!call || messageListener === undefined) {
        throw new Error('No pending resources/read call to resolve');
      }
      postToApp({ jsonrpc: '2.0', id: call.id, result }, source);
    },
    setFetchImpl: (impl: (url: string, init?: unknown) => Promise<unknown>) => {
      fetchImpl = impl;
    },
    getLastPopupText: () => lastPopupText,
    rootEl,
    sendHostContext: (params: Record<string, unknown>) => {
      postToApp({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params
      });
    },
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
    legendsEl: getElementById('legends') as unknown as {
      style: Record<string, string>;
    },
    trafficLegendEl: getElementById('traffic-legend') as unknown as {
      innerHTML?: string;
      style: Record<string, string>;
    },
    errorEl: elementsById.error,
    summaryEl: elementsById.summary,
    carouselEl: getElementById('carousel'),
    mapEl: getElementById('map') as unknown as { clientWidth?: number },
    fitBoundsCalls,
    placeIcon: (
      sandbox.window as {
        __placeIcon?: (maki: unknown, category: unknown) => string;
      }
    ).__placeIcon as (maki: unknown, category: unknown) => string,
    badgeTextColor: (
      sandbox.window as { __badgeTextColor?: (color: unknown) => string }
    ).__badgeTextColor as (color: unknown) => string,
    hoursToday: (
      sandbox.window as {
        __hoursToday?: (
          spec: unknown,
          now: Date,
          timeZone?: string,
          locale?: string
        ) => { state: string; text: string } | null;
      }
    ).__hoursToday,
    priceSigns: (
      sandbox.window as { __priceSigns?: (level: unknown) => string | null }
    ).__priceSigns,
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

describe('mapAppHtml light and dark theme', () => {
  it('follows the system when the host sends no theme', () => {
    expect(
      loadScriptSandbox({ systemDark: true }).rootEl.attributes['data-theme']
    ).toBe('dark');
    expect(
      loadScriptSandbox({ systemDark: false }).rootEl.attributes['data-theme']
    ).toBe('light');
  });

  it("uses the host's theme and style variables over the system's", async () => {
    const { rootEl } = loadScriptSandbox({
      systemDark: true,
      hostContext: {
        theme: 'light',
        styles: {
          variables: {
            '--color-background-primary': '#fafafa',
            'not-a-variable': 'red'
          }
        }
      }
    });
    await Promise.resolve();

    expect(rootEl.attributes['data-theme']).toBe('light');
    expect(rootEl.cssVars).toEqual({ '--color-background-primary': '#fafafa' });
  });

  it('switches when the host changes theme, ignoring other updates', async () => {
    const { rootEl, sendHostContext } = loadScriptSandbox({
      hostContext: { theme: 'light' }
    });

    await Promise.resolve();
    expect(rootEl.attributes['data-theme']).toBe('light');

    sendHostContext({ theme: 'dark' });
    expect(rootEl.attributes['data-theme']).toBe('dark');

    sendHostContext({ displayMode: 'fullscreen' });
    sendHostContext({ theme: 'sepia' });
    expect(rootEl.attributes['data-theme']).toBe('dark');
  });
});

describe('mapAppHtml message source', () => {
  it('ignores a tool-result posted by a window other than the host', () => {
    const { sendToolResult, map } = loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;

    sendToolResult(
      {
        structuredContent: {
          mapboxRender: {
            summary: 'Spoofed',
            layers: [
              {
                id: 'spoofed',
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
      },
      { postMessage: () => {} }
    );

    expect(addLayerSpy).not.toHaveBeenCalled();
  });

  it('ignores a reply to a pending request posted by a window other than the host', async () => {
    const { sendToolResult, resolveResourcesRead, map } = loadScriptSandbox();
    const addLayerSpy = vi.fn();
    map.addLayer = addLayerSpy;
    const ref = 'mapbox://temp/map-payload-abc';
    const readResult = (layerId: string) => ({
      contents: [
        {
          uri: ref,
          mimeType: 'application/json',
          text: JSON.stringify({
            layers: [
              {
                id: layerId,
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
          })
        }
      ]
    });

    sendToolResult({ structuredContent: { mapboxRender: { ref } } });
    resolveResourcesRead(readResult('spoofed'), { postMessage: () => {} });
    await Promise.resolve();
    expect(addLayerSpy).not.toHaveBeenCalled();

    // The request is still pending, so the host's reply is applied.
    resolveResourcesRead(readResult('route'));
    await Promise.resolve();
    expect(addLayerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'route' })
    );
  });
});

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
    expect(sandbox.trafficLegendEl.style.display).toBe('flex');
    expect(sandbox.trafficLegendEl.innerHTML).toMatch(
      /^<span>Fast<\/span>.*#00c94e.*#ff9900.*#ff2b3a.*#8b0a18.*<span>Slow<\/span>$/
    );
    expect(sandbox.legendEl.style.display).not.toBe('block');

    traffic.__fireClick();

    expect(sandbox.styleLayers['mapbox-live-traffic']).toBeUndefined();
    expect(sandbox.styleSources['mapbox-live-traffic']).toBeUndefined();
    expect(traffic.attributes['aria-pressed']).toBe('false');
    expect(sandbox.trafficLegendEl.style.display).toBe('none');
  });

  it('keeps the payload legend alongside the traffic one', () => {
    const sandbox = loadScriptSandbox();
    sendPayload(sandbox, {
      layers: [routeLayer],
      legend: [{ color: '#3b82f6', label: 'Route' }]
    });

    buttons(sandbox).traffic.__fireClick();

    expect(sandbox.legendEl.innerHTML).toContain('Route');
    expect(sandbox.legendEl.innerHTML).not.toContain('traffic');
    expect(sandbox.trafficLegendEl.style.display).toBe('flex');
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

  it("doesn't bring back an earlier render's base map config after a style switch", () => {
    const sandbox = loadScriptSandbox();
    const setConfigProperty = vi.fn();
    (sandbox.map as { setConfigProperty?: unknown }).setConfigProperty =
      setConfigProperty;
    sendPayload(sandbox, { baseMapConfig: { lightPreset: 'night' } });
    sendPayload(sandbox, { layers: [routeLayer] });
    setConfigProperty.mockClear();

    buttons(sandbox).satellite.__fireClick();

    expect(setConfigProperty).not.toHaveBeenCalled();
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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

  it('draws two search refs in one render without a source id collision', async () => {
    // "Driving route from SFO to Palo Alto": the model passed a search ref
    // for each end, and the second addSource("selffetch-search-results")
    // threw "There is already a source with ID".
    const { sendToolResult, setFetchImpl, map, errorEl } = loadScriptSandbox();
    setFetchImpl(async (url: string) => ({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: url.includes('SFO') ? 'SFO' : 'Palo Alto' },
            geometry: {
              type: 'Point',
              coordinates: url.includes('SFO')
                ? [-122.379, 37.621]
                : [-122.143, 37.442]
            }
          }
        ]
      })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/search?data=abc',
          layers: [],
          selfFetch: [
            { tool: 'search', params: { q: 'SFO' } },
            { tool: 'search', params: { q: 'Palo Alto' } }
          ]
        }
      }
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(map.getSource('selffetch-search-results')).toBeTruthy();
    expect(map.getSource('selffetch-search-results-2')).toBeTruthy();
    expect(map.getLayer('selffetch-search-results-2')).toEqual(
      expect.objectContaining({ source: 'selffetch-search-results-2' })
    );
    expect(errorEl?.style.display).not.toBe('block');
  });

  it('shows no distances when the proximity came from the results, not the caller', async () => {
    const { sendToolResult, setFetchImpl, getLastPopupText } =
      loadScriptSandbox();
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Nave Cafe', distance: 4059202 },
          geometry: { type: 'Point', coordinates: [-122.4075, 37.788] }
        }
      ]
    };
    setFetchImpl(async () => ({ ok: true, json: async () => fc }));
    const send = (params: Record<string, unknown>) =>
      sendToolResult({
        structuredContent: {
          mapboxRender: {
            ref: 'mapbox://selffetch/category_search?data=abc',
            layers: [],
            selfFetch: [{ tool: 'category_search', params }]
          }
        }
      });
    const proximity = { longitude: -122.4075, latitude: 37.788 };

    send({ category: 'coffee', proximity, proximityFromResults: true });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(getLastPopupText()).toBe('Nave Cafe');

    send({ category: 'coffee', proximity });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(getLastPopupText()).toBe('Nave Cafe — 4059202 m');
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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

describe('mapAppHtml self-fetch API errors', () => {
  it("shows a Search Box error's nested message instead of [object Object]", async () => {
    const { sendToolResult, setFetchImpl, errorEl } = loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        message: {
          status_code: 400,
          error:
            "Invalid proximity provided. Must be lon,lat coordinates or 'ip'."
        }
      })
    }));

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://selffetch/category_search?data=abc',
          layers: [],
          selfFetch: [{ tool: 'category_search', params: { category: 'cafe' } }]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(errorEl?.textContent).toContain('Invalid proximity provided');
    expect(errorEl?.textContent).not.toContain('[object Object]');
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

    const fetchSpy = vi.fn(async (_url: string) => ({
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
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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
            results: [
              { mapbox_id: coffeeId, attributes: { price_level: 'Cheap' } }
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

    expect(carouselEl.style.display).toBe('block');
    // A place card has no number, just the place's icon until a photo loads.
    const [body, thumb] = carouselEl.children[0].children[0].children;
    expect(thumb.className).toBe('card-thumb empty');
    expect(body.children[0].textContent).toBe('Four Barrel Coffee');
    expect(body.children[1].textContent).toBe('Cafe · $ · 120 m');
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
  it('keeps only markers with an id, using a label as the card number and picking an icon', () => {
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
      // No label: a place pin, so its card has no number either.
      { id: 'b', name: 'Beta', maki: 'bar' }
    ]);

    expect(items).toEqual([
      {
        id: 'a',
        number: 3,
        icon: 'cafe',
        name: 'Alpha',
        category: 'Cafe',
        distanceMeters: 120
      },
      { id: 'b', number: null, icon: 'bar', name: 'Beta' }
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
  it('renders a card per result from category-search self-fetch results, then enriches it via one batched Place Details call', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, getLastPopupText } =
      loadScriptSandbox();

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
                attributes: { price_level: 'Moderate' },
                phone: '+15551234567',
                opening_hours: '24/7',
                telemetry: { tags: { timezone: 'America/Los_Angeles' } }
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

    expect(carouselEl.style.display).toBe('block');
    const list = carouselEl.children[0];
    expect(list.className).toBe('card-list');
    expect(list.children).toHaveLength(1);
    const card = list.children[0];
    const [body, thumb] = card.children;
    const [name, meta, extra] = body.children;

    expect(thumb.className).toBe('card-thumb empty');
    expect(name.textContent).toBe('Cafe Reveille');
    // Category capitalized, price level as dollar signs, no popularity.
    expect(meta.textContent).toBe('Cafe · $$ · 120 m');
    // Hours go on a second line of the card, with a green "Open". The
    // phone number waits for a place detail card.
    expect(extra.className).toBe('card-extra');
    const [status, rest] = extra.children;
    expect(status.className).toBe('hours-open');
    expect(status.textContent).toBe('Open');
    expect(rest.textContent).toBe(' 24 hours');
    expect(extra.children).toHaveLength(2);
    // The first card starts selected.
    expect(card.className).toBe('card active');
    // A place with a card gets no popup on its pin (the search center
    // marker, which has no id, still has one).
    expect(getLastPopupText() ?? '').not.toContain('Cafe Reveille');
  });

  it('never renders a panel for markers without a mapbox_id (e.g. a directions route)', async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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

    expect(carouselEl.style.display).not.toBe('block');
  });

  it('leaves the initial Search-Box-only panel row intact when the Place Details call fails (e.g. quota exceeded)', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, errorEl } =
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

    expect(carouselEl.style.display).toBe('block');
    const row = carouselEl.children[0].children[0];
    expect(row.children[0].className).toBe('card-body');
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
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
    const badId = Buffer.from('urn:mbxpoi:mapbox-n408854').toString('base64');
    const goodId = mockPoiId('good');
    const bodies: unknown[] = [];
    setFetchImpl(async (url: string, init?: unknown) => {
      if (String(url).includes('places/v1/details/retrieve')) {
        bodies.push(JSON.parse((init as { body: string }).body));
        return {
          ok: true,
          json: async () => ({
            results: [
              { mapbox_id: goodId, attributes: { price_level: 'Cheap' } }
            ]
          })
        };
      }
      return twoCafeSearch(badId, goodId);
    });

    sendToolResult(cafeSearchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(bodies).toEqual([{ ids: [goodId] }]);
    const rows = carouselEl.children[0].children;
    expect(rows[1].children[0].children[1].textContent).toBe('$');
  });

  it('drops the id a 422 names and retries the batch once', async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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
            results: [
              { mapbox_id: goodId, attributes: { price_level: 'Cheap' } }
            ]
          })
        };
      }
      return twoCafeSearch(rejectedId, goodId);
    });

    sendToolResult(cafeSearchResult);
    for (let i = 0; i < 30; i++) await Promise.resolve();

    expect(bodies.map((b) => b.ids)).toEqual([[rejectedId, goodId], [goodId]]);
    const rows = carouselEl.children[0].children;
    expect(rows[1].children[0].children[1].textContent).toBe('$');
  });

  it('filters out OSM-sourced ids before the batch call, so one incompatible id does not zero out enrichment for the rest', async () => {
    // Confirmed live against the real API: a category_search-style query
    // for "cafe" near Herndon, VA returned 2 OSM-sourced ids (decode to
    // "urn:mbxpoi-osm:n<osm-node-id>") among 10 results, and Places API's
    // batch endpoint 422s the ENTIRE request if even one id isn't its
    // native "urn:mbxpoi:<uuid>" scheme — silently zeroing out enrichment
    // for all 10, not just the 2 bad ones, before this filter existed.
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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
            results: [
              { mapbox_id: nativeId, attributes: { price_level: 'Cheap' } }
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
    const rows = carouselEl.children[0].children;
    expect(rows).toHaveLength(2);
    expect(rows[0].children[0].children[0].textContent).toBe('OSM Cafe');
    // Never enriched (filtered out before the batch call).
    expect(rows[0].children[0].children[1].textContent).toBe('');

    expect(rows[1].children[0].children[0].textContent).toBe('Native Cafe');
    expect(rows[1].children[0].children[1].textContent).toBe('$');
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
                attributes: { price_level: 'Cheap' }
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
      carouselEl,
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
    // The CDN URL is never used directly. Until the photo arrives the
    // card shows the placeholder, labeled with the place's name.
    const row = carouselEl.children[0].children[0];
    expect(row.children[1].className).toBe('card-thumb empty');

    resolveResourcesRead({
      contents: [{ uri: 'x', mimeType: 'image/jpeg', blob: 'QUJD' }]
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // The placeholder becomes the photo, and its icon goes.
    expect(row.children).toHaveLength(2);
    const [body, thumb] = row.children;
    expect(thumb.className).toBe('card-thumb');
    expect(thumb.innerHTML).toBe('');
    expect(thumb.style.backgroundImage).toBe(
      'url("data:image/jpeg;base64,QUJD")'
    );
    expect(body.children[1].textContent).toBe('$');
    expect(JSON.stringify(row)).not.toContain('mktgcdn');
  });

  it('keeps the placeholder when the server has no photo', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, resolveResourcesRead } =
      loadScriptSandbox();
    setFetchImpl(photoFetch(mockPoiId('photo-poi')));

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    resolveResourcesRead({
      contents: [{ uri: 'x', mimeType: 'text/plain', text: 'No photo' }]
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();

    const [, thumb] = carouselEl.children[0].children[0].children;
    expect(thumb.className).toBe('card-thumb empty');
    expect(thumb.style.backgroundImage).toBeUndefined();
  });

  it('loads the photo URL directly on a standalone page, which has no host or CSP', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, postMessageCalls } =
      loadScriptSandbox({ topLevel: true });
    setFetchImpl(photoFetch(mockPoiId('photo-poi')));

    sendToolResult(searchResult);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    expect(postMessageCalls.some((m) => m.method === 'resources/read')).toBe(
      false
    );
    const [, thumb] = carouselEl.children[0].children[0].children;
    expect(thumb.className).toBe('card-thumb');
    expect(thumb.style.backgroundImage).toBe(
      'url("https://dyn.mktgcdn.com/p/photo.jpg")'
    );
  });

  it('keeps the placeholder on a standalone page when the photo fails to load', async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox({
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

    const [, thumb] = carouselEl.children[0].children[0].children;
    expect(thumb.className).toBe('card-thumb empty');
  });
});

describe('mapAppHtml results side panel: inline markers', () => {
  it('renders and enriches the panel from inline markers that carry an id, with no selfFetch entries at all', async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
    const fetchSpy = vi.fn(async (_url: string) => ({
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

    expect(carouselEl.style.display).toBe('block');
    const list = carouselEl.children[0];
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

  it('turns an id-bearing marker with no explicit style/label into a place pin, with no number on it or its card', async () => {
    // Observed live: Claude built inline POI markers as plain unlabeled
    // pins (default style, no label), so the map showed generic blue dots
    // with no way to tell which one corresponded to which panel row. The
    // panel's own numbering (positional, independent of what's drawn)
    // still worked, but nothing on the map matched it.
    const { sendToolResult, setFetchImpl, carouselEl, markerConstructorCalls } =
      loadScriptSandbox();
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

    // Both markers became place pins (buildPlaceElement), not the default
    // plain-color pin path, and neither got a number.
    expect(markerConstructorCalls).toHaveLength(2);
    const els = markerConstructorCalls.map(
      (c) => c.element as { className: string; innerHTML: string }
    );
    for (const el of els) {
      expect(el.className.split(' ')).toContain('place');
      expect(el.innerHTML).toContain('<svg viewBox="0 0 15 15"');
    }

    // And their cards have no number badge either.
    const rows = carouselEl.children[0].children;
    expect(rows[0].children[0].className).toBe('card-body');
    expect(rows[1].children[0].className).toBe('card-body');
  });

  it('never renders a panel when no inline marker carries an id', () => {
    const { sendToolResult, carouselEl } = loadScriptSandbox();

    sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/abc',
          layers: [],
          markers: [{ coordinates: [-77, 38], style: 'pin' }]
        }
      }
    });

    expect(carouselEl.style.display).not.toBe('block');
  });

  it("replaces the previous render's panel rather than accumulating rows across renders", async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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
    expect(carouselEl.children[0].children).toHaveLength(1);

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

    const list = carouselEl.children[0];
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
      panel.children[0] as unknown as {
        children: Array<{
          children: Array<{
            className: string;
            children: Array<{ textContent: string }>;
          }>;
        }>;
      }
    ).children.map(
      (row) =>
        row.children.find((c) => c.className === 'card-body')?.children[0]
          .textContent
    );

  it('keeps inline numbers and adds merged search results as place pins, in one list', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, markerConstructorCalls } =
      loadScriptSandbox();
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

    // The caller's numbered pins keep their numbers; the search results
    // that join them are place pins (the search center is a plain pin).
    expect(labelsDrawn(markerConstructorCalls)).toEqual(['1', '2']);
    expect(
      markerConstructorCalls.filter((c) =>
        (c.element as { className?: string } | undefined)?.className
          ?.split(' ')
          .includes('place')
      )
    ).toHaveLength(2);
    expect(rowNames(carouselEl)).toEqual(['A', 'B', 'C', 'D']);
    // Each place is looked up once.
    expect(detailsBodies).toEqual([
      [a, b],
      [c, d]
    ]);
  });

  it('ignores a Place Details response from an earlier render', async () => {
    const { sendToolResult, setFetchImpl, carouselEl } = loadScriptSandbox();
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
          results: [{ mapbox_id: id, attributes: { price_level: 'Cheap' } }]
        })
      });
    respond(pending[0]);
    respond(pending[1]);
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const row = (
      carouselEl.children[0] as unknown as {
        children: Array<{
          children: Array<{ children: Array<{ textContent: string }> }>;
        }>;
      }
    ).children[0];
    expect(row.children[0].children[1].textContent).toBe('$');
  });

  it('fits the map above the carousel, and moves the legend up above it', async () => {
    const { sendToolResult, setFetchImpl, fitBoundsCalls } =
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
          legend: [{ label: 'Cafes', color: '#f97316' }],
          markers: [
            { coordinates: at(-122.41), id: mockPoiId('fit-1'), name: 'One' },
            { coordinates: at(-122.42), id: mockPoiId('fit-2'), name: 'Two' }
          ]
        }
      }
    });
    await new Promise((r) => setTimeout(r, 80));
    // The legend sits 8px above the carousel (36px above the logo + 100px
    // before layout), and the fit leaves 12px above that.
    expect(fitBoundsCalls.at(-1)?.padding).toEqual({
      top: 70,
      bottom: 156,
      left: 30,
      right: 30
    });
  });

  it('puts the legends above the carousel, and back when a render has no cards', async () => {
    const { sendToolResult, setFetchImpl, legendsEl } = loadScriptSandbox();
    setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));
    const render = (markers: Array<Record<string, unknown>>) =>
      sendToolResult({
        structuredContent: {
          mapboxRender: {
            ref: 'mapbox://inline/x',
            layers: [],
            legend: [{ label: 'Cafes', color: '#f97316' }],
            markers
          }
        }
      });

    render([{ coordinates: at(-122.41), id: mockPoiId('lg-1'), name: 'One' }]);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(legendsEl.style.bottom).toBe('144px');

    render([{ coordinates: at(-122.41), name: 'No id' }]);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(legendsEl.style.bottom).toBe('');
  });

  it("tints a place pin's icon with the caller's color", async () => {
    const { sendToolResult, setFetchImpl, markerConstructorCalls } =
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
            }
          ]
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();

    const colors = markerConstructorCalls.map(
      (c) => (c.element as { style: Record<string, string> }).style.color
    );
    expect(colors).toEqual(['#6b7280', undefined]);
  });
});

describe('mapAppHtml results side panel: caller labels', () => {
  const at = (lng: number) => [lng, 37.78] as [number, number];
  const badges = (panel: { children: unknown[] }) =>
    (
      panel.children[0] as {
        children: Array<{
          children: Array<{ className: string; textContent: string }>;
        }>;
      }
    ).children.map(
      (row) =>
        row.children.find((c) => c.className === 'card-badge')?.textContent
    );
  // A numbered pin's label, or undefined for a place pin (icon only).
  const labelsDrawn = (calls: Array<Record<string, unknown>>) =>
    calls.map((c) => {
      const el = c.element as
        | { className?: string; textContent?: string }
        | undefined;
      return el?.className?.split(' ').includes('place')
        ? undefined
        : el?.textContent;
    });
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
    const { sendToolResult, setFetchImpl, carouselEl, markerConstructorCalls } =
      loadScriptSandbox();
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
    expect(badges(carouselEl)).toEqual(['3', '1', '2']);
  });

  it('renumbers repeated numbers so each pin matches one row', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, markerConstructorCalls } =
      loadScriptSandbox();
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
    expect(badges(carouselEl)).toEqual(['1', '2', '3']);
  });

  it('shows a letter label on the card, as on its pin', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, markerConstructorCalls } =
      loadScriptSandbox();
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

    // The unlabeled place is a place pin, with no number on its card.
    expect(labelsDrawn(markerConstructorCalls)).toEqual(['A', undefined]);
    expect(badges(carouselEl)).toEqual(['A', undefined]);
  });
});

describe('mapAppHtml results side panel: photos without an MCP host', () => {
  it('loads photos directly when framed by a page that never answers ui/initialize', async () => {
    const { sendToolResult, setFetchImpl, carouselEl, postMessageCalls } =
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
      carouselEl.children[0] as {
        children: Array<{
          children: Array<{ className: string; style: Record<string, string> }>;
        }>;
      }
    ).children[0];
    expect(row.children[1].className).toBe('card-thumb');
    expect(row.children[1].style.backgroundImage).toBe(
      'url("https://example.com/a.jpg")'
    );
  });
});

describe('mapAppHtml results carousel: selecting a place', () => {
  const at = (lng: number) => [lng, 37.78] as [number, number];
  type El = {
    className: string;
    style: Record<string, string>;
    children: El[];
    __fireClick: () => void;
    __fire: (type: string) => void;
    scrollLeft?: number;
    clientWidth?: number;
    offsetLeft?: number;
    offsetWidth?: number;
    scrollIntoView?: (opts: unknown) => void;
    innerHTML?: string;
  };
  async function threePlaces() {
    const sandbox = loadScriptSandbox();
    sandbox.setFetchImpl(async () => ({
      ok: true,
      json: async () => ({ results: [] })
    }));
    sandbox.sendToolResult({
      structuredContent: {
        mapboxRender: {
          ref: 'mapbox://inline/x',
          layers: [],
          markers: ['One', 'Two', 'Three'].map((name, i) => ({
            coordinates: at(-122.41 - i / 100),
            id: mockPoiId('select-' + i),
            name
          }))
        }
      }
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const cards = (sandbox.carouselEl.children[0] as unknown as El).children;
    const pins = sandbox.markerConstructorCalls.map((c) => c.element as El);
    return { ...sandbox, cards, pins };
  }
  const active = (els: El[]) =>
    els.map((el) => el.className.split(' ').includes('active'));

  it('starts with the first card and its pin selected, with names under every pin', async () => {
    const { cards, pins } = await threePlaces();

    expect(active(cards)).toEqual([true, false, false]);
    expect(active(pins)).toEqual([true, false, false]);
    expect(pins[0].className).toBe('marker-badge place active');
    expect(pins[0].style.zIndex).toBe('2');
    const label = pins[0].children[0] as unknown as {
      className: string;
      textContent: string;
    };
    expect(label.className).toBe('marker-name');
    expect(label.textContent).toBe('One');
    // Every carousel pin is labeled, not just the selected one.
    expect(
      pins.map(
        (pin) =>
          (pin.children[0] as unknown as { textContent: string }).textContent
      )
    ).toEqual(['One', 'Two', 'Three']);
  });

  it('selects a card and its pin when the card is clicked', async () => {
    const { cards, pins } = await threePlaces();
    const scrolled = vi.fn();
    cards[2].scrollIntoView = scrolled;

    cards[2].__fireClick();

    expect(active(cards)).toEqual([false, false, true]);
    expect(active(pins)).toEqual([false, false, true]);
    expect(pins[0].style.zIndex).toBe('');
    expect(scrolled).toHaveBeenCalledWith(
      expect.objectContaining({ inline: 'center' })
    );
  });

  it('scrolls to the card when its pin is clicked', async () => {
    const { cards, pins } = await threePlaces();
    const scrolled = vi.fn();
    cards[1].scrollIntoView = scrolled;

    pins[1].__fireClick();

    expect(active(cards)).toEqual([false, true, false]);
    expect(active(pins)).toEqual([false, true, false]);
    expect(scrolled).toHaveBeenCalledOnce();
  });

  it('selects the card that ends up in the middle after a swipe', async () => {
    const { carouselEl, cards, pins } = await threePlaces();
    const list = carouselEl.children[0] as unknown as El;
    cards.forEach((card, i) => {
      card.offsetLeft = 32 + i * 310;
      card.offsetWidth = 300;
    });
    list.clientWidth = 364;
    list.scrollLeft = 310;

    list.__fire('scroll');
    await new Promise((r) => setTimeout(r, 150));

    expect(active(cards)).toEqual([false, true, false]);
    expect(active(pins)).toEqual([false, true, false]);
  });

  it('pans to a hidden pin when its card is picked, but not to a visible one', async () => {
    const { cards, map, mapEl } = await threePlaces();
    const panBy = vi.fn();
    const m = map as unknown as Record<string, unknown>;
    m.panBy = panBy;
    (mapEl as { clientHeight?: number }).clientHeight = 500;
    mapEl.clientWidth = 600;

    // In view, above the carousel.
    m.project = () => ({ x: 300, y: 200 });
    cards[1].__fireClick();
    expect(panBy).not.toHaveBeenCalled();

    // Behind the carousel.
    m.project = () => ({ x: 300, y: 450 });
    cards[2].__fireClick();
    // Carousel top is 364, so the pin goes to 364 - 52 - 24 = 288.
    expect(panBy).toHaveBeenCalledWith([0, 162], { duration: 500 });
  });

  it('pans when only the name label would sit behind the carousel', async () => {
    const { cards, pins, map, mapEl } = await threePlaces();
    const panBy = vi.fn();
    const m = map as unknown as Record<string, unknown>;
    m.panBy = panBy;
    (mapEl as { clientHeight?: number }).clientHeight = 500;
    mapEl.clientWidth = 600;

    // The carousel starts at 500 - 136 = 364; the pin is above it, but
    // its label isn't.
    m.project = () => ({ x: 300, y: 330 });
    cards[1].__fireClick();
    expect(panBy).toHaveBeenCalledTimes(1);

    // Clicking a pin in the same spot pans too.
    pins[2].__fireClick();
    expect(panBy).toHaveBeenCalledTimes(2);
  });
});

describe('mapAppHtml place pin icons', () => {
  const { placeIcon } = loadScriptSandbox();

  it.each([
    ['cafe', undefined, 'cafe'], // the result's own maki
    ['rocket', 'Coffee Shop', 'cafe'], // a maki we don't carry falls to the category
    [undefined, 'Pizza Restaurant', 'restaurant-pizza'], // checked before "restaurant"
    [undefined, 'café', 'cafe'],
    [undefined, 'Barber Shop', 'shop'], // whole words, so not "bar"
    [undefined, 'Space Center', 'marker'],
    [undefined, undefined, 'marker']
  ])('maki %s, category %s -> %s', (maki, category, icon) => {
    expect(placeIcon(maki, category)).toBe(icon);
  });
});

describe('mapAppHtml badge text color', () => {
  const { badgeTextColor } = loadScriptSandbox();

  it.each([
    ['#f97316', '#1a0f04'], // default orange: white is only 2.8:1
    ['#22c55e', '#1a0f04'], // start green
    ['#2563eb', '#fff'], // numbered blue
    ['#ef4444', '#1a0f04'], // end red
    ['#0f172a', '#fff'],
    ['#fff', '#1a0f04'],
    ['not-a-color', '#fff']
  ])('%s gets %s numbers', (bg, text) => {
    expect(badgeTextColor(bg)).toBe(text);
  });
});

describe('mapAppHtml results carousel: hours today', () => {
  const { hoursToday, priceSigns } = loadScriptSandbox();
  // 2026-10-19 is a Monday; 2026-10-25 a Sunday.
  const monday = new Date(2026, 9, 19, 12);
  const sunday = new Date(2026, 9, 25, 12);

  // No time zone: today's hours on the viewer's day, no open/closed claim.
  it.each([
    ['24/7', monday, { state: 'open', text: '24 hours' }],
    [
      'Mo-Fr 07:00-19:00; Sa,Su 08:00-17:00',
      monday,
      { state: 'hours', text: 'Open 7:00–19:00' }
    ],
    [
      'Mo-Fr 07:00-19:00; Sa,Su 08:00-17:00',
      sunday,
      { state: 'hours', text: 'Open 8:00–17:00' }
    ],
    [
      'Mo 09:00-12:00,13:00-17:00',
      monday,
      { state: 'hours', text: 'Open 9:00–12:00, 13:00–17:00' }
    ],
    ['Mo-Su 08:00-20:00; Su off', sunday, { state: 'closed', text: 'today' }],
    ['Fr-Mo 10:00-22:00', monday, { state: 'hours', text: 'Open 10:00–22:00' }],
    ['Tu-Sa 10:00-18:00', monday, { state: 'closed', text: 'today' }],
    ['Mo-Fr 07:00-19:00; PH off', monday, null],
    ['Mo 9am-5pm', monday, null],
    ['', monday, null],
    [undefined, monday, null]
  ])('%s', (spec, now, expected) => {
    expect(hoursToday?.(spec, now, undefined, 'en-GB')).toEqual(expected);
  });

  // With the place's time zone: open now, or closed and when it opens.
  // Times are UTC instants read in the place's zone.
  const at = (iso: string) => new Date(iso);
  it.each([
    // Monday 12:00 in New York (16:00 UTC).
    [
      'Mo-Fr 07:00-19:00',
      at('2026-10-19T16:00:00Z'),
      'America/New_York',
      { state: 'open', text: 'until 19:00' }
    ],
    // Monday 06:00 in New York: opens later today.
    [
      'Mo-Fr 07:00-19:00',
      at('2026-10-19T10:00:00Z'),
      'America/New_York',
      { state: 'closed', text: '· opens 7:00' }
    ],
    // Monday 20:00 in New York: done for the day.
    [
      'Mo-Fr 07:00-19:00',
      at('2026-10-20T00:00:00Z'),
      'America/New_York',
      { state: 'closed', text: '' }
    ],
    // Monday 01:00 in New York, open from Sunday's late shift.
    [
      'Su 18:00-02:00; Mo 10:00-22:00',
      at('2026-10-19T05:00:00Z'),
      'America/New_York',
      { state: 'open', text: 'until 2:00' }
    ],
    // Monday 23:00 in New York, inside a range that runs past midnight.
    [
      'Mo 18:00-02:00',
      at('2026-10-20T03:00:00Z'),
      'America/New_York',
      { state: 'open', text: 'until 2:00' }
    ],
    // Split day: between the two ranges.
    [
      'Mo 09:00-12:00,13:00-17:00',
      at('2026-10-19T16:30:00Z'),
      'America/New_York',
      { state: 'closed', text: '· opens 13:00' }
    ],
    // It's already Tuesday in Tokyo, so Monday-only hours don't apply.
    [
      'Mo 09:00-17:00',
      at('2026-10-19T16:00:00Z'),
      'Asia/Tokyo',
      { state: 'closed', text: '' }
    ],
    // Unknown zone falls back to the viewer's day.
    [
      'Mo 09:00-17:00',
      monday,
      'Not/AZone',
      { state: 'hours', text: 'Open 9:00–17:00' }
    ]
  ])('%s at %s in %s', (spec, now, timeZone, expected) => {
    expect(hoursToday?.(spec, now, timeZone, 'en-GB')).toEqual(expected);
  });

  it.each([
    ['Cheap', '$'],
    ['Moderate', '$$'],
    ['Expensive', '$$$'],
    ['Very Expensive', '$$$$'],
    ['Pricey', null],
    [undefined, null]
  ])('price level %s is %s', (level, expected) => {
    expect(priceSigns?.(level)).toBe(expected);
  });
});
