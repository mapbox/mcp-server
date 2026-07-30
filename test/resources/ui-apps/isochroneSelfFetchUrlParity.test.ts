// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildIsochroneRequestUrl } from '../../../src/tools/isochrone-tool/buildIsochroneRequestUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook `window.__buildIsochroneApiUrl` — the
 * hand-ported client-side twin of buildIsochroneRequestUrl. Keeps the two
 * implementations from drifting apart, mirroring
 * directionsSelfFetchUrlParity.test.ts.
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

  const win = sandbox.window as { __buildIsochroneApiUrl?: ClientBuildUrlFn };
  if (!win.__buildIsochroneApiUrl) {
    throw new Error(
      'window.__buildIsochroneApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildIsochroneApiUrl;
}

describe('Isochrone self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string for a full set of parameters', () => {
    const input = {
      profile: 'mapbox/walking',
      coordinates: { longitude: -73.989, latitude: 40.733 },
      contours_minutes: [5, 10, 15],
      contours_colors: ['ff0000', '00ff00', '0000ff'],
      polygons: true,
      denoise: 0.5,
      generalize: 100,
      exclude: ['ferry'],
      depart_at: '2026-07-20T09:00:00'
    };

    const serverUrl = buildIsochroneRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
    });

    const buildClientUrl = loadClientBuildUrlFn();
    const clientUrl = buildClientUrl(
      input,
      'pk.test-token',
      'https://api.mapbox.com/'
    );

    expect(clientUrl).toBe(serverUrl);
  });

  it('produces the same query string using contours_meters instead of contours_minutes', () => {
    const input = {
      profile: 'mapbox/driving',
      coordinates: { longitude: -73.989, latitude: 40.733 },
      contours_meters: [1000, 5000],
      generalize: 2000
    };

    const serverUrl = buildIsochroneRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
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
      profile: 'mapbox/driving-traffic',
      coordinates: { longitude: -73.989, latitude: 40.733 },
      contours_minutes: [10]
    };

    const serverUrl = buildIsochroneRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/'
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
