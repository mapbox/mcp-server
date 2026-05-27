// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import {
  SearchAndGeocodeAppTool,
  CategorySearchAppTool
} from '../../../src/tools/search-app-tool/SearchAppTool.js';

const fakeSearchResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      properties: {
        name: 'Blue Bottle Coffee',
        full_address: '66 Mint St, San Francisco, CA',
        poi_category: ['cafe', 'coffee shop']
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-122.42, 37.78] },
      properties: {
        name: 'Sightglass Coffee',
        full_address: '270 7th St, San Francisco, CA',
        poi_category: ['cafe']
      }
    }
  ]
};

function makeOkResponse(body: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

describe('SearchAndGeocodeAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns shaped results and the search resource reference', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeSearchResponse)
    );

    const result = await new SearchAndGeocodeAppTool({ httpRequest }).run({
      q: 'coffee',
      proximity: { longitude: -122.42, latitude: 37.78 }
    });

    expect(result.isError).toBe(false);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search/searchbox/v1/forward');
    expect(calledUrl).toContain('q=coffee');
    expect(calledUrl).toContain('proximity=-122.42%2C37.78');

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.results).toHaveLength(2);
    expect(payload.results[0].name).toBe('Blue Bottle Coffee');
    expect(payload.results[0].index).toBe(1);
    expect(payload.results[0].category).toBe('cafe');
  });

  it('declares the shared search resourceUri', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new SearchAndGeocodeAppTool({ httpRequest });
    expect(tool.meta?.ui?.resourceUri).toBe(
      'ui://mapbox/search-app/index.html'
    );
  });

  it('errors when no results are returned', async () => {
    const { httpRequest } = setupHttpRequest(
      makeOkResponse({ type: 'FeatureCollection', features: [] })
    );

    const result = await new SearchAndGeocodeAppTool({ httpRequest }).run({
      q: 'asdfqwerty'
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No matching places');
  });

  it('errors on non-2xx API response', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Bad query' }),
      text: async () => '{"message":"Bad query"}'
    });

    const result = await new SearchAndGeocodeAppTool({ httpRequest }).run({
      q: 'coffee'
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Search API error');
  });
});

describe('CategorySearchAppTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits the category endpoint and shapes results identically', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest(
      makeOkResponse(fakeSearchResponse)
    );

    const result = await new CategorySearchAppTool({ httpRequest }).run({
      category: 'cafe',
      proximity: { longitude: -122.42, latitude: 37.78 },
      limit: 5
    });

    expect(result.isError).toBe(false);

    const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search/searchbox/v1/category/cafe');
    expect(calledUrl).toContain('limit=5');

    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.kind).toBe('category');
    expect(payload.results).toHaveLength(2);
  });

  it('shares the same MCP App resource as search_and_geocode_app_tool', () => {
    const { httpRequest } = setupHttpRequest();
    const search = new SearchAndGeocodeAppTool({ httpRequest });
    const category = new CategorySearchAppTool({ httpRequest });
    expect(category.meta?.ui?.resourceUri).toBe(search.meta?.ui?.resourceUri);
  });
});
