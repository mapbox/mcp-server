// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildSearchAndGeocodeRequestUrl } from '../../../src/tools/search-and-geocode-tool/buildSearchAndGeocodeRequestUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  params: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook
 * `window.__buildSearchAndGeocodeApiUrl` — the hand-ported client-side twin
 * of buildSearchAndGeocodeRequestUrl. Keeps the two implementations from
 * drifting apart, mirroring directionsSelfFetchUrlParity.test.ts.
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
    __buildSearchAndGeocodeApiUrl?: ClientBuildUrlFn;
  };
  if (!win.__buildSearchAndGeocodeApiUrl) {
    throw new Error(
      'window.__buildSearchAndGeocodeApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildSearchAndGeocodeApiUrl;
}

describe('Search self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string for a full set of parameters', () => {
    const input = {
      q: 'coffee shop',
      language: 'en',
      proximity: { longitude: -73.989, latitude: 40.733 },
      bbox: {
        minLongitude: -74.1,
        minLatitude: 40.6,
        maxLongitude: -73.9,
        maxLatitude: 40.8
      },
      country: ['us', 'ca'],
      types: ['poi'],
      poi_category: ['coffee'],
      auto_complete: true,
      eta_type: 'navigation',
      navigation_profile: 'driving',
      origin: { longitude: -73.98, latitude: 40.73 }
    };

    const serverUrl = buildSearchAndGeocodeRequestUrl({
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
    const input = { q: 'blue bottle coffee' };

    const serverUrl = buildSearchAndGeocodeRequestUrl({
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
