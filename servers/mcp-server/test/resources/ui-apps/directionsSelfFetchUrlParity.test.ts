// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildDirectionsRequestUrl } from '../../../src/tools/directions-tool/buildDirectionsRequestUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook `window.__buildDirectionsApiUrl` — the
 * hand-ported client-side twin of buildDirectionsRequestUrl. This is the
 * parity check that keeps the two implementations from drifting apart. See
 * the equivalent check that existed for the old per-tool directions iframe,
 * test/tools/directions-tool/directionsUrlParity.test.ts (removed when that
 * iframe was folded into the generic render_map_tool app in PR #199) — this
 * is its spiritual successor, adapted to the generic iframe + self-fetch ref.
 */
function loadClientBuildUrlFn(): ClientBuildUrlFn {
  const html = renderMapAppHtml({
    publicToken: 'pk.parity-test-token',
    apiEndpoint: 'https://api.mapbox.com/'
  });

  const scriptMatch = html.match(
    /<script>\n\(function\(\) \{[\s\S]*?\}\)\(\);\n<\/script>/
  );
  if (!scriptMatch) {
    throw new Error('Could not find inline <script> block in rendered HTML');
  }
  const scriptSource = scriptMatch[0]
    .replace(/^<script>\n/, '')
    .replace(/<\/script>$/, '');

  const fakeElement = {
    style: {} as Record<string, string>,
    textContent: ''
  };
  const sandbox: Record<string, unknown> = {
    window: {
      addEventListener: () => {},
      parent: { postMessage: () => {} }
    },
    document: {
      getElementById: () => fakeElement,
      createElement: () => fakeElement
    },
    URLSearchParams,
    console,
    setTimeout,
    fetch: async () => ({ ok: false, status: 599, json: async () => ({}) })
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox);

  const win = sandbox.window as { __buildDirectionsApiUrl?: ClientBuildUrlFn };
  if (!win.__buildDirectionsApiUrl) {
    throw new Error(
      'window.__buildDirectionsApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildDirectionsApiUrl;
}

describe('Directions self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string for a full set of parameters', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ],
      routing_profile: 'mapbox/driving',
      geometries: 'none' as const,
      alternatives: true,
      exclude: 'toll,point(-73.98 40.74)',
      depart_at: '2026-07-20T09:00:00',
      max_height: 4.5,
      max_width: 2.4,
      max_weight: 12.5
    };

    const serverUrl = buildDirectionsRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson'
    });

    const buildClientUrl = loadClientBuildUrlFn();
    const clientUrl = buildClientUrl(
      input,
      'pk.test-token',
      'https://api.mapbox.com/'
    );

    expect(clientUrl).toBe(serverUrl);
  });

  it('produces the same query string when using arrive_by instead of depart_at', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ],
      routing_profile: 'mapbox/driving',
      geometries: 'none' as const,
      alternatives: true,
      exclude: 'toll,point(-73.98 40.74)',
      arrive_by: '2026-07-20T09:00:00',
      max_height: 4.5,
      max_width: 2.4,
      max_weight: 12.5
    };

    const serverUrl = buildDirectionsRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson'
    });

    const buildClientUrl = loadClientBuildUrlFn();
    const clientUrl = buildClientUrl(
      input,
      'pk.test-token',
      'https://api.mapbox.com/'
    );

    expect(clientUrl).toBe(serverUrl);
  });

  it('produces the same query string for the minimal set of parameters', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ],
      routing_profile: 'mapbox/driving-traffic',
      geometries: 'none' as const,
      alternatives: false
    };

    const serverUrl = buildDirectionsRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson'
    });

    const buildClientUrl = loadClientBuildUrlFn();
    const clientUrl = buildClientUrl(
      input,
      'pk.test-token',
      'https://api.mapbox.com/'
    );

    expect(clientUrl).toBe(serverUrl);
  });

  it('encodes an exclude value containing "&"/"=" identically on both sides, without letting it inject a query parameter', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ],
      routing_profile: 'mapbox/driving',
      geometries: 'none' as const,
      alternatives: false,
      exclude: 'point(0 0 &injected=evil)'
    };

    const serverUrl = buildDirectionsRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson'
    });

    const buildClientUrl = loadClientBuildUrlFn();
    const clientUrl = buildClientUrl(
      input,
      'pk.test-token',
      'https://api.mapbox.com/'
    );

    expect(clientUrl).toBe(serverUrl);

    const params = new URLSearchParams(serverUrl.split('?')[1]);
    expect(params.get('injected')).toBeNull();
    expect(params.getAll('alternatives')).toEqual(['false']);
    expect(params.get('exclude')).toBe('point(0 0 &injected=evil)');
  });
});
