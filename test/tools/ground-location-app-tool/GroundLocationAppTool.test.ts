// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { GroundLocationAppTool } from '../../../src/tools/ground-location-app-tool/GroundLocationAppTool.js';

const geocodeResponse = {
  features: [
    {
      properties: {
        name: 'Leesburg',
        full_address: 'Leesburg, Virginia, United States'
      }
    }
  ]
};

const poiResponse = {
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-77.5636, 39.1157] },
      properties: { name: 'Cafe Roma', poi_category: ['cafe'] }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-77.564, 39.116] },
      properties: { name: 'Black Walnut', poi_category: ['cafe'] }
    }
  ]
};

function makeOk(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('GroundLocationAppTool', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns reverse-geocoded origin + nearby POIs', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('geocode/v6/reverse'))
        return makeOk(geocodeResponse) as Response;
      if (url.includes('search/searchbox/v1/category/'))
        return makeOk(poiResponse) as Response;
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await new GroundLocationAppTool({ httpRequest }).run({
      coordinates: { longitude: -77.5636, latitude: 39.1157 },
      query: 'cafe'
    });

    expect(result.isError).toBe(false);
    expect(httpRequest).toHaveBeenCalledTimes(2);

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.origin.name).toBe('Leesburg');
    expect(payload.query).toBe('cafe');
    expect(payload.pois).toHaveLength(2);
    expect(payload.pois[0].index).toBe(1);
  });

  it('works without a query (geocode only, no POI call)', async () => {
    const httpRequest = vi.fn(async (url: string) => {
      if (url.includes('geocode/v6/reverse'))
        return makeOk(geocodeResponse) as Response;
      throw new Error(`Unexpected URL (should not be called): ${url}`);
    });

    const result = await new GroundLocationAppTool({ httpRequest }).run({
      coordinates: { longitude: -77.5636, latitude: 39.1157 }
    });

    expect(result.isError).toBe(false);
    expect(httpRequest).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.pois).toEqual([]);
  });

  it('errors when reverse geocoding returns nothing', async () => {
    const httpRequest = vi.fn(async () => makeOk({ features: [] }) as Response);

    const result = await new GroundLocationAppTool({ httpRequest }).run({
      coordinates: { longitude: 0, latitude: 0 }
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Could not reverse-geocode');
  });

  it('declares the ground-location resourceUri', () => {
    const httpRequest = vi.fn();
    const tool = new GroundLocationAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/ground-location-app/index.html'
    );
  });
});
