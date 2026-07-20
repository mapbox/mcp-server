// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildDirectionsRequestUrl } from '../../../src/tools/directions-tool/buildDirectionsRequestUrl.js';
import { renderDirectionsAppHtml } from '../../../src/resources/ui-apps/directionsAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook `window.__buildDirectionsApiUrl` — the
 * hand-ported client-side twin of buildDirectionsRequestUrl. This is the
 * parity check that keeps the two implementations from drifting apart.
 */
function loadClientBuildUrlFn(): ClientBuildUrlFn {
  const html = renderDirectionsAppHtml({
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
      addEventListener: () => {}
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

describe('Directions URL builder parity (server vs. iframe self-fetch)', () => {
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
});
