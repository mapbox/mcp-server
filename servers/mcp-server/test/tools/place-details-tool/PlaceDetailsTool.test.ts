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

// Shaped after a live response from places/v1/details/retrieve.
const sampleResponse = {
  mapbox_id: 'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY',
  name: 'Golden Gate Park',
  full_address: 'Golden Gate Park, San Francisco, CA 94117, United States',
  brand: null,
  primary_category: 'park',
  categories: ['park', 'recreation_area'],
  permanently_closed: false,
  status: 'active',
  created_at: '2026-07-02T02:56:22.965',
  updated_at: '2026-07-15T01:45:22.019',
  score: { closed: 0, popularity: 0.85, reality: 0.9 },
  coordinates: {
    latitude: 37.7749,
    longitude: -122.4194,
    source: 'poi',
    routable_points: [
      { name: 'driving', latitude: 37.7748, longitude: -122.4193 }
    ]
  },
  address: {
    city: 'San Francisco',
    region: 'California',
    country: 'United States',
    country_code: 'US'
  },
  attributes: {}
};

const sampleResponseWithVenue = {
  ...sampleResponse,
  phone: '+1-415-831-2700',
  website: 'https://sfrecpark.org/parks/golden-gate-park/'
};

const sampleResponseWithOpeningHours = {
  ...sampleResponse,
  opening_hours:
    'Mo 09:00-21:00; Tu 09:00-21:00; We 09:00-21:00; Th 09:00-21:00; Fr 09:00-22:00; Sa 10:00-22:00'
};

const sampleResponseWithPhotos = {
  ...sampleResponse,
  photos: [
    { url: 'https://example.com/photo1.jpg', width: 800, height: 600 },
    { url: 'https://example.com/photo2.jpg', width: 400, height: 300 }
  ]
};

const boundaryMapboxId = 'dXJuOm1ieHBsYzpIa2pvN0E';

// Shaped after a live response from search/details/v1/retrieve for a city
// (a mapbox_id the Places API rejects — see the fallback tests below).
const legacyBoundaryFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-87.632362, 41.881953] },
  properties: {
    name: 'Chicago',
    mapbox_id: boundaryMapboxId,
    feature_type: 'place',
    full_address: 'Chicago, Illinois, United States',
    place_formatted: 'Illinois, United States',
    bbox: [-87.940377, 41.624491, -87.49696, 42.034847],
    context: {
      country: { id: 'dXJuOm1ieHBsYzpJdXc', name: 'United States' },
      region: { id: 'dXJuOm1ieHBsYzpST3c', name: 'Illinois' }
    },
    coordinates: { latitude: 41.881953, longitude: -87.632362 },
    metadata: {}
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
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    assertHeadersSent(mockHttpRequest);
  });

  it('constructs the correct URL against the Places API', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(
      'places/v1/details/retrieve/dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    );
    expect(calledUrl).toContain('access_token=');
    // The Places API's Details endpoint has no attribute_sets, language, or
    // worldview parameters (unlike the older Details API this tool used
    // previously) — it always returns the same shape.
    expect(calledUrl).not.toContain('attribute_sets');
    expect(calledUrl).not.toContain('language');
    expect(calledUrl).not.toContain('worldview');
  });

  it('URL-encodes the mapbox_id in the path', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const mapboxId = 'dXJuOm1ieHBvaTpB/special+id';
    await new PlaceDetailsTool({ httpRequest }).run({ mapbox_id: mapboxId });

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(mapboxId));
  });

  it('returns formatted text content for valid input', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Name: Golden Gate Park');
    expect(text).toContain(
      'Address: Golden Gate Park, San Francisco, CA 94117, United States'
    );
    expect(text).toContain('Coordinates: 37.7749, -122.4194');
    expect(text).toContain('Type: park');
    expect(text).toContain('Category: park, recreation_area');
    expect(text).toContain('Popularity: 85%');
  });

  it('includes phone and website in formatted text when present', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponseWithVenue
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Phone: +1-415-831-2700');
    expect(text).toContain(
      'Website: https://sfrecpark.org/parks/golden-gate-park/'
    );
  });

  it('notes permanently closed places in formatted text', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({ ...sampleResponse, permanently_closed: true })
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Status: Permanently closed');
  });

  it('formats the opening_hours string into readable lines', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponseWithOpeningHours
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Hours:');
    expect(text).toContain('Mo 09:00-21:00');
    expect(text).toContain('Sa 10:00-22:00');
  });

  it('lists photo URLs when present', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponseWithPhotos
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Photos:');
    expect(text).toContain('https://example.com/photo1.jpg');
    expect(text).toContain('https://example.com/photo2.jpg');
  });

  it('returns structured content', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleResponse
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id:
        'dXJuOm1ieHBvaTpmMzRhMDkxOC1kZTRjLTQyNDktODkwNi00ODMxNmUxODMzMzY'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as typeof sampleResponse).name).toBe(
      'Golden Gate Park'
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

  it('falls back to the legacy Details API when the Places API rejects a boundary mapbox_id', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    mockHttpRequest.mockReset();
    mockHttpRequest
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () =>
          JSON.stringify({
            message: `Invalid mapbox_id format: ${boundaryMapboxId}`
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => legacyBoundaryFeature
      });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: boundaryMapboxId
    });

    expect(result.isError).toBe(false);
    expect(mockHttpRequest).toHaveBeenCalledTimes(2);
    expect(mockHttpRequest.mock.calls[0][0]).toContain(
      'places/v1/details/retrieve/'
    );
    expect(mockHttpRequest.mock.calls[1][0]).toContain(
      'search/details/v1/retrieve/'
    );

    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Name: Chicago');
    expect(text).toContain('Type: place');
    expect(text).toContain('Coordinates: 41.881953, -87.632362');

    const data = result.structuredContent as Record<string, unknown>;
    expect(data.mapbox_id).toBe(boundaryMapboxId);
    expect(data.full_address).toBe('Chicago, Illinois, United States');
    expect(data.bbox).toEqual([-87.940377, 41.624491, -87.49696, 42.034847]);
  });

  it('forwards attribute_sets/language/worldview to the legacy fallback request', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    mockHttpRequest.mockReset();
    mockHttpRequest
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () =>
          JSON.stringify({ message: 'Invalid mapbox_id format' })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => legacyBoundaryFeature
      });

    await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: boundaryMapboxId,
      attribute_sets: ['venue'],
      language: 'fr',
      worldview: 'jp'
    });

    const fallbackUrl = mockHttpRequest.mock.calls[1][0];
    expect(fallbackUrl).toContain('attribute_sets=basic%2Cvenue');
    expect(fallbackUrl).toContain('language=fr');
    expect(fallbackUrl).toContain('worldview=jp');
  });

  it('returns an error when both the Places API and the legacy fallback fail', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    mockHttpRequest.mockReset();
    mockHttpRequest
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        text: async () =>
          JSON.stringify({ message: 'Invalid mapbox_id format' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({
            message: 'Could not complete Location Details retrieve'
          })
      });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'invalid'
    });

    expect(result.isError).toBe(true);
    expect(
      (result.content[0] as { type: 'text'; text: string }).text
    ).toContain('Could not complete Location Details retrieve');
  });

  it('does not fall back to the legacy API for non-422 errors', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => JSON.stringify({ message: 'Place not found' })
    });

    const result = await new PlaceDetailsTool({ httpRequest }).run({
      mapbox_id: 'nonexistent-id'
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
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
