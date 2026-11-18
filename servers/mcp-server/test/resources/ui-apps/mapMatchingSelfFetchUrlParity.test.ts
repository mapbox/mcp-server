// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildMapMatchingRequestUrl } from '../../../src/tools/map-matching-tool/buildMapMatchingRequestUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook `window.__buildMapMatchingApiUrl` —
 * the hand-ported client-side twin of buildMapMatchingRequestUrl. Note the
 * client always forces geometries=geojson/overview=full (see
 * buildMapMatchingApiUrl), so the server-side comparison fixtures below do
 * the same via geometries/overview on the input.
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
    __buildMapMatchingApiUrl?: ClientBuildUrlFn;
  };
  if (!win.__buildMapMatchingApiUrl) {
    throw new Error(
      'window.__buildMapMatchingApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildMapMatchingApiUrl;
}

describe('Map Matching self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string for a full set of parameters', () => {
    const input = {
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 },
        { longitude: -73.969, latitude: 40.753 }
      ],
      profile: 'walking',
      timestamps: [1000, 1010, 1020],
      radiuses: [10, 15, 20],
      annotations: ['speed', 'congestion'],
      overview: 'full',
      geometries: 'geojson'
    };

    const serverUrl = buildMapMatchingRequestUrl({
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
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ],
      profile: 'driving',
      overview: 'full',
      geometries: 'geojson'
    };

    const serverUrl = buildMapMatchingRequestUrl({
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
