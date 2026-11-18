// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { buildReverseGeocodeUrl } from '../../../src/tools/ground-location-tool/buildReverseGeocodeUrl.js';
import { renderMapAppHtml } from '../../../src/resources/ui-apps/mapAppHtml.js';

type ClientBuildUrlFn = (
  input: unknown,
  publicToken: string,
  apiEndpoint: string
) => string;

/**
 * Extracts and runs the iframe's inline <script> in a sandboxed VM context,
 * then returns its exposed test hook
 * `window.__buildReverseGeocodeApiUrl` — the hand-ported client-side twin
 * of buildReverseGeocodeUrl. Keeps the two implementations from drifting
 * apart, mirroring categorySearchSelfFetchUrlParity.test.ts.
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
    __buildReverseGeocodeApiUrl?: ClientBuildUrlFn;
  };
  if (!win.__buildReverseGeocodeApiUrl) {
    throw new Error(
      'window.__buildReverseGeocodeApiUrl was not exposed by the iframe script'
    );
  }
  return win.__buildReverseGeocodeApiUrl;
}

describe('Ground location self-fetch URL builder parity (server vs. iframe)', () => {
  it('produces the same query string with a language', () => {
    const input = {
      longitude: -122.419,
      latitude: 37.759,
      types: 'address,poi',
      language: 'en'
    };

    const serverUrl = buildReverseGeocodeUrl({
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
      longitude: -122.419,
      latitude: 37.759,
      types: 'neighborhood,locality,place'
    };

    const serverUrl = buildReverseGeocodeUrl({
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
