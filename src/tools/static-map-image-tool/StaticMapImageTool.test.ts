process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { StaticMapImageTool } from '../static-map-image-tool/StaticMapImageTool.js';

describe('StaticMapImageTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new StaticMapImageTool().run({
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 600, height: 400 },
      style: 'mapbox/streets-v12'
    });

    assertHeadersSent(mockFetch);
  });

  it('returns image content with base64 data', async () => {
    // Mock image buffer
    const mockImageBuffer = Buffer.from('fake-image-data');
    const mockArrayBuffer = mockImageBuffer.buffer.slice(
      mockImageBuffer.byteOffset,
      mockImageBuffer.byteOffset + mockImageBuffer.byteLength
    );

    const mockFetch = setupFetch({
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer)
    });

    const result = await new StaticMapImageTool().run({
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 10,
      size: { width: 800, height: 600 },
      style: 'mapbox/satellite-v9'
    });

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: 'image',
      data: mockImageBuffer.toString('base64'),
      mimeType: 'image/jpeg' // satellite is a raster style
    });
  });

  it('constructs correct Mapbox Static API URL', async () => {
    const mockFetch = setupFetch();

    await new StaticMapImageTool().run({
      center: { longitude: -122.4194, latitude: 37.7749 },
      zoom: 15,
      size: { width: 1024, height: 768 },
      style: 'mapbox/dark-v10'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('styles/v1/mapbox/dark-v10/static/');
    expect(calledUrl).toContain('-122.4194,37.7749,15');
    expect(calledUrl).toContain('1024x768');
    expect(calledUrl).toContain('access_token=');
  });

  it('uses default style when not specified', async () => {
    const mockFetch = setupFetch();

    await new StaticMapImageTool().run({
      center: { longitude: 0, latitude: 0 },
      zoom: 1,
      size: { width: 300, height: 200 }
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('styles/v1/mapbox/streets-v12/static/');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const result = await new StaticMapImageTool().run({
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 600, height: 400 }
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Failed to fetch map image: 404 Not Found'
    });
  });

  it('validates coordinate constraints', async () => {
    const tool = new StaticMapImageTool();

    // Test invalid longitude
    await expect(
      tool.run({
        center: { longitude: -181, latitude: 40 },
        zoom: 10,
        size: { width: 600, height: 400 }
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test invalid latitude
    await expect(
      tool.run({
        center: { longitude: -74, latitude: 90 },
        zoom: 10,
        size: { width: 600, height: 400 }
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('validates size constraints', async () => {
    const tool = new StaticMapImageTool();

    // Test size too large
    await expect(
      tool.run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 10,
        size: { width: 1281, height: 600 }
      })
    ).resolves.toMatchObject({
      isError: true
    });

    // Test size too small
    await expect(
      tool.run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 10,
        size: { width: 0, height: 600 }
      })
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('supports high density parameter', async () => {
    const mockFetch = setupFetch();

    await new StaticMapImageTool().run({
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 600, height: 400 },
      highDensity: true
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('600x400@2x');
  });

  describe('overlay support', () => {
    it('adds marker overlay to URL', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'large',
            label: 'a',
            color: 'ff0000'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('pin-l-a+ff0000(-74.006,40.7128)/');
    });

    it('adds custom marker overlay to URL', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'custom-marker',
            longitude: -74.006,
            latitude: 40.7128,
            url: 'https://example.com/marker.png'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(
        `url-${encodeURIComponent('https://example.com/marker.png')}(-74.006,40.7128)/`
      );
    });

    it('adds path overlay to URL', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'path',
            encodedPolyline: 'u{~vFvyys@fS]',
            strokeWidth: 3,
            strokeColor: '0000ff',
            strokeOpacity: 0.8,
            fillColor: 'ff0000',
            fillOpacity: 0.5
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(
        `path-3+0000ff-0.8+ff0000-0.5(${encodeURIComponent('u{~vFvyys@fS]')})/`
      );
    });

    it('adds GeoJSON overlay to URL', async () => {
      const mockFetch = setupFetch();

      const geoJsonData = {
        type: 'Point',
        coordinates: [-74.006, 40.7128]
      };

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'geojson',
            data: geoJsonData
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(
        `geojson(${encodeURIComponent(JSON.stringify(geoJsonData))})/`
      );
    });

    it('supports multiple overlays in order', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.01,
            latitude: 40.71,
            size: 'small',
            color: '00ff00'
          },
          {
            type: 'marker',
            longitude: -74.002,
            latitude: 40.715,
            size: 'large',
            label: 'b',
            color: 'ff0000'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain(
        'pin-s+00ff00(-74.01,40.71),pin-l-b+ff0000(-74.002,40.715)/'
      );
    });

    it('works without overlays', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 }
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should not have overlay string before coordinates
      expect(calledUrl).toMatch(/static\/-74\.006,40\.7128,12/);
    });

    it('transforms uppercase labels to lowercase', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'small',
            label: 'Z',
            color: '0000ff'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should contain lowercase 'z' even though 'Z' was provided
      expect(calledUrl).toContain('pin-s-z+0000ff(-74.006,40.7128)/');
    });

    it('supports Maki icon names as labels', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'large',
            label: 'embassy',
            color: 'ff0000'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('pin-l-embassy+ff0000(-74.006,40.7128)/');
    });

    it('transforms uppercase Maki icon names to lowercase', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.01,
            latitude: 40.71,
            size: 'small',
            label: 'AIRPORT',
            color: '00ff00'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should contain lowercase 'airport' even though 'AIRPORT' was provided
      expect(calledUrl).toContain('pin-s-airport+00ff00(-74.01,40.71)/');
    });

    it('supports numeric labels', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'large',
            label: '42',
            color: '0000ff'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('pin-l-42+0000ff(-74.006,40.7128)/');
    });

    it('handles complex overlay combination with paths and markers', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -80.278, latitude: 25.796 },
        zoom: 15,
        size: { width: 800, height: 600 },
        style: 'mapbox/streets-v12',
        overlays: [
          {
            type: 'marker',
            longitude: -80.2793529,
            latitude: 25.7950805,
            size: 'large',
            label: 'A',
            color: 'ff0000'
          },
          {
            type: 'marker',
            longitude: -80.27899169921875,
            latitude: 25.796667098999023,
            size: 'large',
            label: 'S',
            color: '00cc00'
          },
          {
            type: 'path',
            encodedPolyline:
              'mbm|C~k~hNzBCdAg@ZYnAoDWsR[yHgAmEc@mDeAiWGqIHyJYwKQgA_@@h@|JKlRVj^W|Co@hCyBzDi@f@c@NeAjAg@|AXhRzAbD',
            strokeWidth: 4,
            strokeColor: '0066ff'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Check that markers have lowercase labels
      expect(calledUrl).toContain('pin-l-a+ff0000(-80.2793529,25.7950805)');
      expect(calledUrl).toContain(
        'pin-l-s+00cc00(-80.27899169921875,25.796667098999023)'
      );
      // Check path
      const expectedPolyline =
        'mbm|C~k~hNzBCdAg@ZYnAoDWsR[yHgAmEc@mDeAiWGqIHyJYwKQgA_@@h@|JKlRVj^W|Co@hCyBzDi@f@c@NeAjAg@|AXhRzAbD';
      expect(calledUrl).toContain(
        `path-4+0066ff(${encodeURIComponent(expectedPolyline)})`
      );
    });

    it('truncates non-Maki multi-character labels to first character', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'small',
            label: 'Hello',
            color: '0000ff'
          },
          {
            type: 'marker',
            longitude: -74.01,
            latitude: 40.71,
            size: 'large',
            label: 'XYZ',
            color: 'ff0000'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should contain only the first character in lowercase
      expect(calledUrl).toContain('pin-s-h+0000ff(-74.006,40.7128)');
      expect(calledUrl).toContain('pin-l-x+ff0000(-74.01,40.71)');
    });

    it('preserves full Maki icon names that are in the supported list', async () => {
      const mockFetch = setupFetch();

      await new StaticMapImageTool().run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        overlays: [
          {
            type: 'marker',
            longitude: -74.006,
            latitude: 40.7128,
            size: 'small',
            label: 'restaurant',
            color: '0000ff'
          },
          {
            type: 'marker',
            longitude: -74.01,
            latitude: 40.71,
            size: 'large',
            label: 'hospital',
            color: 'ff0000'
          },
          {
            type: 'marker',
            longitude: -74.005,
            latitude: 40.715,
            size: 'small',
            label: 'BICYCLE', // uppercase should be converted to lowercase
            color: '00ff00'
          }
        ]
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      // Should preserve the full Maki icon names
      expect(calledUrl).toContain('pin-s-restaurant+0000ff(-74.006,40.7128)');
      expect(calledUrl).toContain('pin-l-hospital+ff0000(-74.01,40.71)');
      expect(calledUrl).toContain('pin-s-bicycle+00ff00(-74.005,40.715)');
    });
  });
});
