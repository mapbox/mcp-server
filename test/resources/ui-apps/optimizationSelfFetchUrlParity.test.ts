// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildOptimizationRequestUrl } from '../../../src/tools/optimization-tool/buildOptimizationRequestUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook `window.__buildOptimizationApiUrl` —
 * the hand-ported client-side twin of buildOptimizationRequestUrl. Note the
 * client always forces geometries=geojson/overview=full (see
 * buildOptimizationApiUrl), so the server-side comparison fixtures below
 * pass the same via geometriesOverride/overviewOverride.
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

  const win = sandbox.window as {
    __buildOptimizationApiUrl?: ClientBuildUrlFn;
  };
  if (!win.__buildOptimizationApiUrl) {
    throw new Error(
      'window.__buildOptimizationApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildOptimizationApiUrl;
}

describe('Optimization self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string for a full set of parameters', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 },
        { longitude: -73.969, latitude: 40.753 }
      ],
      profile: 'mapbox/walking',
      source: 'first',
      destination: 'last',
      roundtrip: false,
      steps: true,
      annotations: ['duration', 'distance'],
      language: 'en'
    };

    const serverUrl = buildOptimizationRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson',
      overviewOverride: 'full'
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
      profile: 'mapbox/driving',
      roundtrip: true
    };

    const serverUrl = buildOptimizationRequestUrl({
      input,
      accessToken: 'pk.test-token',
      apiEndpoint: 'https://api.mapbox.com/',
      geometriesOverride: 'geojson',
      overviewOverride: 'full'
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
