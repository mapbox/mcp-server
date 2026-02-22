// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { PlaceDetailsTool } from '../../../src/tools/place-details-tool/PlaceDetailsTool.js';

const sampleResponse = {
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [-122.4194, 37.7749]
  },
  properties: {
    name: 'Golden Gate Park',
    mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB',
    feature_type: 'poi',
    full_address: 'Golden Gate Park, San Francisco, CA 94117',
    place_formatted: 'San Francisco, CA 94117',
    poi_category: ['park', 'recreation area'],
    poi_category_ids: ['park', 'recreation_area'],
    context: {
      place: { name: 'San Francisco' },
      region: { name: 'California' },
      country: { name: 'United States', country_code: 'US' }
    },
    coordinates: {
      longitude: -122.4194,
      latitude: 37.7749
    },
    maki: 'park'
  }
};

const sampleResponseWithVenue = {
  ...sampleResponse,
  properties: {
    ...sampleResponse.properties,
    metadata: {
      phone: '+1-415-831-2700',
      website: 'https://sfrecpark.org/parks/golden-gate-park/',
      rating: 4.8,
      review_count: 12500,
      popularity: 0.92
    }
  }
};

describe('PlaceDetailsTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB'
    });

    assertHeadersSent(mockHttpRequest);
  });

  it('constructs correct URL with required parameters', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(
      'search/details/v1/retrieve/dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB'
    );
    expect(calledUrl).toContain('access_token=');
    expect(calledUrl).not.toContain('attribute_sets');
    expect(calledUrl).not.toContain('language');
    expect(calledUrl).not.toContain('worldview');
  });

  it('includes optional parameters in URL when provided', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB',
      attribute_sets: ['basic', 'visit', 'venue'],
      language: 'fr',
      worldview: 'us'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('attribute_sets=basic%2Cvisit%2Cvenue');
    expect(calledUrl).toContain('language=fr');
    expect(calledUrl).toContain('worldview=us');
  });

  it('URL-encodes the mapbox_id in the path', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const mapboxId = 'dXJuOm1ieHBsYzpB/special+id';
    await new PlaceDetailsTool({ httpRequest }).run({ mapbox_id: mapboxId });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(mapboxId));
  });

  it('returns formatted text content for valid input', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Name: Golden Gate Park');
    expect(text).toContain(
      'Address: Golden Gate Park, San Francisco, CA 94117'
    );
    expect(text).toContain('Coordinates: 37.7749, -122.4194');
    expect(text).toContain('Type: poi');
    expect(text).toContain('Category: park, recreation area');
  });

  it('includes venue metadata in formatted text when present', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponseWithVenue
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB',
      attribute_sets: ['basic', 'venue', 'visit']
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Phone: +1-415-831-2700');
    expect(text).toContain(
      'Website: https://sfrecpark.org/parks/golden-gate-park/'
    );
    expect(text).toContain('Rating: 4.8');
    expect(text).toContain('Reviews: 12500');
    expect(text).toContain('Popularity: 92%');
  });

  it('returns structured content', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'dXJuOm1ieHBsYzpBYUFBQUFBQUFBQUFBQUFB'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as typeof sampleResponse).type).toBe(
      'Feature'
    );
  });

  it('handles API errors gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => JSON.stringify({ message: 'Place not found' })
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'nonexistent-id'
    });

    expect(result.isError).toBe(true);
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('Place not found');
  });

  it('handles 400 error from invalid mapbox_id', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ message: 'Invalid mapbox_id format' })
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'invalid'
    });

    expect(result.isError).toBe(true);
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('Invalid mapbox_id format');
  });

  it('requires mapbox_id input', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({});

    expect(result.isError).toBe(true);
  });

  it('has output schema defined', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new PlaceDetailsTool({ httpRequest });
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });
});
