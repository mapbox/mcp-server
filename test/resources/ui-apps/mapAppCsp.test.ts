// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { mapAppCsp } from '../../../src/resources/ui-apps/mapAppCsp.js';

describe('mapAppCsp', () => {
  it('names exact Mapbox hosts instead of a *.mapbox.com wildcard', () => {
    expect(mapAppCsp('https://api.mapbox.com/')).toEqual({
      connectDomains: ['https://api.mapbox.com', 'https://events.mapbox.com'],
      resourceDomains: ['https://api.mapbox.com'],
      workerDomains: ['blob:']
    });
  });

  it('adds a custom MAPBOX_API_ENDPOINT origin to connectDomains', () => {
    const csp = mapAppCsp('https://api-staging.example.com/v1/');
    expect(csp.connectDomains).toEqual([
      'https://api.mapbox.com',
      'https://events.mapbox.com',
      'https://api-staging.example.com'
    ]);
    expect(csp.resourceDomains).toEqual(['https://api.mapbox.com']);
  });

  it('ignores an endpoint it cannot parse', () => {
    expect(mapAppCsp('not a url').connectDomains).toEqual([
      'https://api.mapbox.com',
      'https://events.mapbox.com'
    ]);
  });

  it('never allows a wildcard host', () => {
    const csp = mapAppCsp('https://api.mapbox.com/');
    const all = [...csp.connectDomains, ...csp.resourceDomains];
    expect(all.some((domain) => domain.includes('*'))).toBe(false);
  });
});
