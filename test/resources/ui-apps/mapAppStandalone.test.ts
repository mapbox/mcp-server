// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import {
  renderStandaloneMapHtml,
  standaloneMapAppScript,
  standaloneScriptUrl
} from '../../../src/resources/ui-apps/mapAppStandalone.js';
import {
  mapAppScript,
  renderMapAppHtml
} from '../../../src/resources/ui-apps/mapAppHtml.js';

/**
 * Runs the hosted standalone script against a fake page with the given
 * #map-config and #initial-data tags. Top-level page: window.parent is the
 * window itself, as in a real browser with no host.
 */
function runStandalone(config: unknown, initialData: unknown) {
  const elements: Record<string, { textContent: string; style: object }> = {
    'map-config': { textContent: JSON.stringify(config), style: {} },
    'initial-data': { textContent: JSON.stringify(initialData), style: {} }
  };
  const fetchUrls: string[] = [];
  const mapboxgl = {
    accessToken: '',
    Map: function Map() {
      return {
        addControl: () => {},
        on: (event: string, cb: () => void) => {
          if (event === 'load') cb();
        },
        once: () => {},
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
    },
    NavigationControl: function NavigationControl() {},
    Marker: function Marker() {
      const m = {
        setLngLat: () => m,
        addTo: () => m,
        setPopup: () => m,
        remove: () => {}
      };
      return m;
    },
    Popup: function Popup() {
      return { setText: () => ({}), setHTML: () => ({}) };
    }
  };
  const listeners: Array<(e: { data: unknown }) => void> = [];
  const win: Record<string, unknown> = {
    addEventListener: (event: string, cb: (e: { data: unknown }) => void) => {
      if (event === 'message') listeners.push(cb);
    }
  };
  win.parent = {
    postMessage: (data: unknown) => listeners.forEach((l) => l({ data }))
  };
  const sandbox = {
    window: win,
    document: {
      getElementById: (id: string) =>
        (elements[id] ??= { textContent: '', style: {} }),
      createElement: () => ({ style: {}, textContent: '', className: '' })
    },
    mapboxgl,
    console,
    setTimeout,
    URLSearchParams,
    fetch: (url: string) => {
      fetchUrls.push(url);
      return Promise.resolve({
        ok: false,
        status: 599,
        json: async () => ({})
      });
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(standaloneMapAppScript(), sandbox);
  return { mapboxgl, fetchUrls, errorEl: elements.error };
}

describe('standalone map app', () => {
  it('reads its token and API endpoint from the page', () => {
    const { mapboxgl, fetchUrls, errorEl } = runStandalone(
      { token: 'pk.page-token', apiEndpoint: 'https://example.test/' },
      {
        layers: [],
        selfFetch: [
          {
            tool: 'directions',
            params: {
              coordinates: [
                { longitude: -105, latitude: 39.75 },
                { longitude: -105.2, latitude: 39.66 }
              ]
            }
          }
        ]
      }
    );
    expect(mapboxgl.accessToken).toBe('pk.page-token');
    expect(errorEl?.textContent ?? '').toBe('');
    expect(fetchUrls.length).toBeGreaterThan(0);
    expect(fetchUrls[0].startsWith('https://example.test/')).toBe(true);
    expect(fetchUrls[0]).toContain('access_token=pk.page-token');
  });

  it('is the in-chat script with only the config source changed', () => {
    const inline = mapAppScript({ token: '"T"', apiEndpoint: '"E"' });
    const standalone = standaloneMapAppScript();
    const strip = (s: string) =>
      s
        .replace(/var TOKEN = .*;\n/, '')
        .replace(/var API_ENDPOINT = .*;\n/, '');
    expect(strip(standalone).trimEnd()).toBe(strip(inline).trimEnd());
    expect(renderMapAppHtml({ publicToken: 'pk.x' })).toContain(
      mapAppScript({
        token: '"pk.x"',
        apiEndpoint: '"https://api.mapbox.com/"'
      })
    );
  });

  it('pins the script URL to the package version', () => {
    expect(standaloneScriptUrl('1.2.3')).toBe(
      'https://cdn.jsdelivr.net/npm/@mapbox/mcp-server@1.2.3/dist/map-app/standalone.js'
    );
    const html = renderStandaloneMapHtml({
      publicToken: 'pk.x',
      payload: { layers: [] },
      packageVersion: '1.2.3',
      scriptUrl: 'https://cdn.example/standalone.js'
    });
    expect(html).toContain('src="https://cdn.example/standalone.js"');
  });
});
