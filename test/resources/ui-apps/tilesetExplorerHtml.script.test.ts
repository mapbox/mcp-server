// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { renderTilesetExplorerHtml } from '../../../src/resources/ui-apps/tilesetExplorerHtml.js';

type Listener = (event?: unknown) => void;
type FakeElement = {
  id: string;
  hidden: boolean;
  className: string;
  children: FakeElement[];
  style: Record<string, unknown>;
  textContent: string;
  value: string;
  checked: boolean;
  appendChild: (child: FakeElement) => FakeElement;
  addEventListener: (type: string, fn: Listener) => void;
  fire: (type: string) => void;
  [key: string]: unknown;
};

function fakeElement(id = ''): FakeElement {
  const listeners: Record<string, Listener[]> = {};
  const attributes: Record<string, string> = {};
  let text = '';
  const el: FakeElement = {
    id,
    hidden: false,
    className: '',
    children: [],
    style: { setProperty: () => {} },
    value: '',
    checked: false,
    get textContent() {
      return text + el.children.map((c) => c.textContent).join('');
    },
    set textContent(value: string) {
      text = value;
      el.children = [];
    },
    appendChild: (child) => {
      el.children.push(child);
      return child;
    },
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
    fire: (type) => listeners[type]?.forEach((fn) => fn({})),
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
    getAttribute: (name: string) => attributes[name] ?? null
  };
  return el;
}

const STATIC_IDS = [
  'map',
  'panel',
  'load-form',
  'tileset-input',
  'load-button',
  'error',
  'tileset-name',
  'tileset-meta',
  'opt-boundaries',
  'opt-basemap',
  'layers-section',
  'layers-title',
  'layers-all',
  'layers-none',
  'layers',
  'feature',
  'zoom'
];

type LayerSpec = {
  id: string;
  type: string;
  'source-layer'?: string;
  layout?: { visibility?: string };
};

/** The parts of a GL JS map the explorer uses. */
class FakeMap {
  static last: FakeMap | undefined;
  sources: Record<string, Record<string, unknown>> = {};
  layers: LayerSpec[] = [];
  handlers: Record<string, Array<(e?: unknown) => void>> = {};
  zoom: number;
  rendered: unknown[] = [];
  fitted: unknown;
  showTileBoundaries = false;
  styles: unknown[] = [];
  constructor(options: { zoom: number; style: unknown }) {
    this.zoom = options.zoom;
    this.styles.push(options.style);
    FakeMap.last = this;
  }
  addControl() {}
  on(type: string, fn: (e?: unknown) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  emit(type: string, event?: unknown) {
    this.handlers[type]?.forEach((fn) => fn(event));
  }
  addSource(id: string, source: Record<string, unknown>) {
    this.sources[id] = source;
  }
  getSource(id: string) {
    return this.sources[id];
  }
  removeSource(id: string) {
    delete this.sources[id];
  }
  addLayer(layer: LayerSpec) {
    this.layers.push(layer);
  }
  getLayer(id: string) {
    return this.layers.find((l) => l.id === id);
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter((l) => l.id !== id);
  }
  setLayoutProperty(id: string, name: string, value: string) {
    const layer = this.getLayer(id)!;
    layer.layout = { ...layer.layout, [name]: value };
  }
  setStyle(style: unknown) {
    this.styles.push(style);
    this.sources = {};
    this.layers = [];
  }
  jumpTo(camera: { zoom: number }) {
    this.zoom = camera.zoom;
  }
  fitBounds(bounds: unknown) {
    this.fitted = bounds;
    this.zoom = 3;
  }
  setZoom(zoom: number) {
    this.zoom = zoom;
  }
  getZoom() {
    return this.zoom;
  }
  getCenter() {
    return { lng: 24.9, lat: 60.2 };
  }
  getBounds() {
    return {
      getWest: () => 24,
      getSouth: () => 60,
      getEast: () => 25,
      getNorth: () => 61
    };
  }
  resize() {}
  queryRenderedFeatures() {
    return this.rendered;
  }
}

class FakePopup {
  setLngLat() {
    return this;
  }
  setText() {
    return this;
  }
  addTo() {
    return this;
  }
  remove() {}
}

type WebMcpTool = {
  name: string;
  execute: (input?: unknown) => unknown;
};

function loadExplorer(
  options: {
    publicToken?: string;
    hostContext?: Record<string, unknown>;
    hostCapabilities?: Record<string, unknown>;
    webMcp?: boolean;
  } = {}
) {
  const html = renderTilesetExplorerHtml({
    publicToken: options.publicToken ?? 'pk.test'
  });
  const source = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error('No inline <script> in the explorer HTML');

  FakeMap.last = undefined;
  const byId: Record<string, FakeElement> = {};
  for (const id of STATIC_IDS) byId[id] = fakeElement(id);
  byId.error.hidden = true;
  byId['layers-section'].hidden = true;

  const sent: Array<Record<string, unknown>> = [];
  const tools: WebMcpTool[] = [];
  const parent = {
    postMessage: (msg: Record<string, unknown>) => sent.push(msg)
  };
  let onMessage: (event: { data: unknown; source: unknown }) => void = () => {};

  const context = vm.createContext({
    window: {
      parent,
      addEventListener: (_: string, fn: typeof onMessage) => (onMessage = fn),
      innerWidth: 1000,
      // GL JS is "already loaded".
      mapboxgl: { Map: FakeMap, Popup: FakePopup }
    },
    mapboxgl: {
      Map: FakeMap,
      Popup: FakePopup,
      AttributionControl: class {},
      NavigationControl: class {}
    },
    document: {
      getElementById: (id: string) => byId[id],
      createElement: () => fakeElement(),
      documentElement: fakeElement('html'),
      head: fakeElement('head'),
      ...(options.webMcp
        ? {
            modelContext: {
              registerTool: (tool: WebMcpTool) => tools.push(tool)
            }
          }
        : {})
    },
    // Debounced work runs at once.
    setTimeout: (fn: () => void, ms?: number) => {
      if (ms === 400) fn();
      return 0;
    },
    clearTimeout: () => {},
    Map,
    Promise,
    Object,
    String,
    Math,
    JSON,
    Array,
    Error
  });
  vm.runInContext(source, context);

  const deliver = (data: unknown) => onMessage({ data, source: parent });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const respond = (method: string, result: unknown) => {
    const request = [...sent].reverse().find((m) => m.method === method)!;
    deliver({ jsonrpc: '2.0', id: request.id, result });
  };

  respond('ui/initialize', {
    hostContext: options.hostContext ?? {},
    hostCapabilities: options.hostCapabilities ?? {}
  });

  /** Deliver a tool result and finish loading the style. */
  const open = async (structuredContent: unknown) => {
    await settle();
    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { structuredContent, content: [{ type: 'text', text: 'ok' }] }
    });
    FakeMap.last?.emit('style.load');
    return FakeMap.last!;
  };

  return { byId, sent, deliver, respond, settle, open, tools };
}

const parks = {
  tilesetExplorer: true,
  tileset_id: 'mofei.parks',
  name: 'Parks',
  type: 'vector',
  bounds: [24.5, 60.1, 25.3, 60.4],
  minzoom: 5,
  maxzoom: 14,
  layers: [
    { id: 'parks', fields: { name: 'String', area: 'Number' } },
    { id: 'trails', fields: {} }
  ]
};

describe('tilesetExplorerHtml', () => {
  it('draws every source layer as fill, line and circle layers', async () => {
    const { byId, open } = loadExplorer();
    const map = await open(parks);

    expect(map.sources['tileset-explorer']).toEqual({
      type: 'vector',
      url: 'mapbox://mofei.parks'
    });
    expect(map.layers.map((l) => `${l.id}:${l['source-layer']}`)).toEqual([
      'tx-0-fill:parks',
      'tx-0-line:parks',
      'tx-0-circle:parks',
      'tx-1-fill:trails',
      'tx-1-line:trails',
      'tx-1-circle:trails'
    ]);
    expect(byId['tileset-name'].textContent).toBe('Parks');
    expect(byId['tileset-meta'].textContent).toBe(
      'vector · zoom 5 to 14 · 2 layers'
    );
    expect(byId['tileset-input'].value).toBe('mofei.parks');
    expect(byId['layers-section'].hidden).toBe(false);
    expect(byId.layers.children).toHaveLength(2);
    expect(byId.layers.children[0].textContent).toContain('2 fields');
  });

  it('never frames a tileset below its minzoom', async () => {
    const { byId, open } = loadExplorer();
    const map = await open(parks);
    expect(map.fitted).toEqual([
      [24.5, 60.1],
      [25.3, 60.4]
    ]);
    // fitBounds landed on 3; the tileset starts at 5.
    expect(map.getZoom()).toBe(5);
    expect(byId.zoom.textContent).toBe('z 5.0');
  });

  it('draws a raster tileset as one raster layer', async () => {
    const { byId, open } = loadExplorer();
    const map = await open({
      tilesetExplorer: true,
      tileset_id: 'mapbox.satellite',
      type: 'raster',
      layers: []
    });
    expect(map.sources['tileset-explorer']).toMatchObject({
      type: 'raster',
      url: 'mapbox://mapbox.satellite'
    });
    expect(map.layers.map((l) => l.id)).toEqual(['tx-raster']);
    expect(byId['layers-section'].hidden).toBe(true);
    expect(byId.feature.textContent).toContain('no features');
  });

  it('hides a layer from its checkbox', async () => {
    const { byId, open } = loadExplorer();
    const map = await open(parks);
    // layer > row > label > checkbox
    const box = byId.layers.children[1].children[0].children[0].children[0];
    box.checked = false;
    box.fire('change');
    expect(
      map.layers.filter((l) => l.layout?.visibility === 'none').map((l) => l.id)
    ).toEqual(['tx-1-fill', 'tx-1-line', 'tx-1-circle']);
  });

  it('puts the tileset back after the base map changes the style', async () => {
    const { byId, open } = loadExplorer();
    const map = await open(parks);
    byId['opt-basemap'].checked = true;
    byId['opt-basemap'].fire('change');
    expect(map.styles[1]).toBe('mapbox://styles/mapbox/light-v11');
    expect(map.layers).toHaveLength(0);
    map.emit('style.load');
    expect(map.layers).toHaveLength(6);
  });

  it('shows the properties of a clicked feature and shares it with the chat', async () => {
    const { byId, sent, open, respond, settle } = loadExplorer({
      hostContext: { displayMode: 'fullscreen' },
      hostCapabilities: { updateModelContext: {} }
    });
    const map = await open(parks);
    respond('ui/update-model-context', {});
    await settle();

    map.rendered = [
      {
        sourceLayer: 'parks',
        id: 7,
        geometry: { type: 'Polygon' },
        properties: { name: 'Kaivopuisto', area: 12 }
      }
    ];
    map.emit('click', {
      point: { x: 10, y: 10 },
      lngLat: { lng: 24.95, lat: 60.15 }
    });

    expect(byId.feature.textContent).toBe(
      'layerparksgeometryPolygonid7nameKaivopuistoarea12'
    );
    const update = [...sent]
      .reverse()
      .find((m) => m.method === 'ui/update-model-context')!.params as {
      content: Array<{ text: string; _meta: Record<string, string> }>;
      structuredContent: { tileset: { tileset_id: string; layers: string[] } };
    };
    expect(update.content[0]._meta['openai/title']).toBe('parks: Kaivopuisto');
    expect(update.content[0].text).toContain('source layer parks (Polygon)');
    expect(update.content[0].text).toContain('"name":"Kaivopuisto"');
    expect(update.structuredContent.tileset).toMatchObject({
      tileset_id: 'mofei.parks',
      layers: ['parks', 'trails']
    });
  });

  it('shares nothing while it is inline', async () => {
    const { sent, open } = loadExplorer({
      hostContext: { displayMode: 'inline' },
      hostCapabilities: { updateModelContext: {} }
    });
    await open(parks);
    expect(sent.some((m) => m.method === 'ui/update-model-context')).toBe(
      false
    );
  });

  it('loads another tileset from the form through the server tool', async () => {
    const { byId, sent, open, respond, settle } = loadExplorer();
    const map = await open(parks);
    byId['tileset-input'].value = ' mapbox.mapbox-terrain-v2 ';
    byId['load-form'].fire('submit');

    const call = sent.find((m) => m.method === 'tools/call')!;
    expect(call.params).toEqual({
      name: 'tileset_explorer_tool',
      arguments: { tileset_id: 'mapbox.mapbox-terrain-v2' }
    });
    respond('tools/call', {
      content: [{ type: 'text', text: 'Tileset mapbox.mapbox-terrain-v2' }],
      structuredContent: {
        tilesetExplorer: true,
        tileset_id: 'mapbox.mapbox-terrain-v2',
        type: 'vector',
        layers: [{ id: 'contour', fields: { ele: 'Number' } }]
      }
    });
    await settle();
    expect(map.sources['tileset-explorer'].url).toBe(
      'mapbox://mapbox.mapbox-terrain-v2'
    );
    expect(map.layers.map((l) => l.id)).toEqual([
      'tx-0-fill',
      'tx-0-line',
      'tx-0-circle'
    ]);
  });

  it('shows the error when a tileset cannot be loaded and keeps the current one', async () => {
    const { byId, open, respond, settle } = loadExplorer();
    const map = await open(parks);
    byId['tileset-input'].value = 'mofei.gone';
    byId['load-form'].fire('submit');
    respond('tools/call', {
      isError: true,
      content: [{ type: 'text', text: "Couldn't load tileset mofei.gone: 404" }]
    });
    await settle();
    expect(byId.error.hidden).toBe(false);
    expect(byId.error.textContent).toContain('mofei.gone: 404');
    expect(map.sources['tileset-explorer'].url).toBe('mapbox://mofei.parks');
  });

  it('lists layers without a map when there is no public token', async () => {
    const { byId, open } = loadExplorer({ publicToken: '' });
    const map = await open(parks);
    expect(map).toBeUndefined();
    expect(byId.layers.children).toHaveLength(2);
    expect(byId.error.textContent).toContain('public token');
  });

  it('registers WebMCP tools that load a tileset and read the view', async () => {
    const { tools, sent, open, respond } = loadExplorer({ webMcp: true });
    const map = await open(parks);
    expect(tools.map((t) => t.name)).toEqual([
      'load_tileset',
      'read_tileset_view'
    ]);

    map.rendered = [
      {
        sourceLayer: 'parks',
        id: 1,
        geometry: { type: 'Polygon' },
        properties: { name: 'A' }
      },
      // The same polygon again, from its line layer.
      {
        sourceLayer: 'parks',
        id: 1,
        geometry: { type: 'Polygon' },
        properties: { name: 'A' }
      },
      {
        sourceLayer: 'parks',
        id: 2,
        geometry: { type: 'Polygon' },
        properties: { name: 'B' }
      }
    ];
    const view = JSON.parse(String(tools[1].execute()));
    expect(view.tileset_id).toBe('mofei.parks');
    expect(view.view.zoom).toBe(5);
    expect(view.layers).toEqual([
      {
        id: 'parks',
        visible: true,
        featuresInView: 2,
        samples: [
          { geometry: 'Polygon', properties: { name: 'A' } },
          { geometry: 'Polygon', properties: { name: 'B' } }
        ]
      },
      { id: 'trails', visible: true, featuresInView: 0, samples: [] }
    ]);

    const loading = tools[0].execute({
      tileset_id: 'mapbox.satellite'
    }) as Promise<string>;
    expect(sent.find((m) => m.method === 'tools/call')!.params).toMatchObject({
      arguments: { tileset_id: 'mapbox.satellite' }
    });
    respond('tools/call', {
      content: [{ type: 'text', text: 'Tileset mapbox.satellite: raster.' }],
      structuredContent: {
        tilesetExplorer: true,
        tileset_id: 'mapbox.satellite',
        type: 'raster',
        layers: []
      }
    });
    await expect(loading).resolves.toBe('Tileset mapbox.satellite: raster.');
    expect(map.layers.map((l) => l.id)).toEqual(['tx-raster']);
  });
});
