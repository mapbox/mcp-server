process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { cleanup } from '../../utils/requestUtils.js';
import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { IsochroneTool } from '../isochrone-tool/IsochroneTool.js';

describe('IsochroneTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    cleanup();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new IsochroneTool().run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/driving',
      contours_minutes: [10],
      generalize: 1000
    });

    assertHeadersSent(mockFetch);
  });

  it('sends correct parameters', async () => {
    const mockFetch = setupFetch({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });
    await new IsochroneTool().run({
      coordinates: { longitude: 27.534527, latitude: 53.9353451 },
      profile: 'mapbox/driving',
      contours_minutes: [10, 20],
      contours_colors: ['ff0000', '00ff00'],
      polygons: true,
      denoise: 0.5,
      generalize: 1000,
      exclude: ['toll'],
      depart_at: '2025-06-02T12:00:00Z'
    });
    assertHeadersSent(mockFetch);
    const calledUrl = mockFetch.mock.calls[0][0].toString();
    expect(calledUrl).toContain(
      'isochrone/v1/mapbox/driving/27.534527%2C53.9353451'
    );
    expect(calledUrl).toContain('contours_minutes=10%2C20');
    expect(calledUrl).toContain('contours_colors=ff0000%2C00ff00');
    expect(calledUrl).toContain('polygons=true');
    expect(calledUrl).toContain('denoise=0.5');
    expect(calledUrl).toContain('generalize=1000');
    expect(calledUrl).toContain('exclude=toll');
    expect(calledUrl).toContain('depart_at=2025-06-02T12%3A00%3A00Z');
  });

  it('does not send empty parameters', async () => {
    const mockFetch = setupFetch({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });
    await new IsochroneTool().run({
      coordinates: { longitude: 27.534527, latitude: 53.9353451 },
      profile: 'mapbox/driving',
      contours_minutes: [10, 20],
      generalize: 1000
    });
    const calledUrl = mockFetch.mock.calls[0][0].toString();
    expect(calledUrl).toContain(
      'isochrone/v1/mapbox/driving/27.534527%2C53.9353451'
    );
    expect(calledUrl).toContain('contours_minutes=10%2C20');
    expect(calledUrl).not.toContain('contours_colors');
    expect(calledUrl).not.toContain('polygons');
    expect(calledUrl).not.toContain('denoise');
    expect(calledUrl).not.toContain('exclude');
    expect(calledUrl).not.toContain('depart_at');
  });

  it('returns geojson from API', async () => {
    const geojson = { type: 'FeatureCollection', features: [{ id: 42 }] };
    const mockFetch = setupFetch({
      ok: true,
      json: async () => geojson
    });

    const result = await new IsochroneTool().run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/walking',
      contours_minutes: [5],
      generalize: 1000
    });

    assertHeadersSent(mockFetch);
    expect(result.content[0].type).toEqual('text');
    if (result.content[0].type == 'text') {
      expect(result.content[0].text).toEqual(JSON.stringify(geojson));
    }
  });

  it('throws on invalid input', async () => {
    const tool = new IsochroneTool();
    const result = await tool.run({
      coordinates: { longitude: 0, latitude: 0 },
      profile: 'invalid',
      contours_minutes: [5]
    });

    expect(result.content[0].type).toEqual('text');
    expect(result.isError).toBe(true);
  });

  it('throws if neither contours_minutes nor contours_meters is specified', async () => {
    const result = await new IsochroneTool().run({
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/driving',
      generalize: 1000
    });

    expect(result.content[0].type).toEqual('text');
    expect(result.isError).toBe(true);
  });
});
