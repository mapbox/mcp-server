process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { cleanup } from '../../utils/requestUtils.js';
import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { MatrixTool } from './MatrixTool.js';

const sampleMatrixResponse = {
  code: 'Ok',
  durations: [
    [0, 573, 1169.5],
    [573, 0, 597],
    [1169.5, 597, 0]
  ],
  destinations: [
    {
      name: 'Mission Street',
      location: [-122.418408, 37.751668],
      distance: 5
    },
    {
      name: '22nd Street',
      location: [-122.422959, 37.755184],
      distance: 8
    },
    {
      name: '',
      location: [-122.426911, 37.759695],
      distance: 10
    }
  ],
  sources: [
    {
      name: 'Mission Street',
      location: [-122.418408, 37.751668],
      distance: 5
    },
    {
      name: '22nd Street',
      location: [-122.422959, 37.755184],
      distance: 8
    },
    {
      name: '',
      location: [-122.426911, 37.759695],
      distance: 10
    }
  ]
};

const sampleMatrixWithDistanceResponse = {
  ...sampleMatrixResponse,
  distances: [
    [0, 934.2, 1837.2],
    [934.2, 0, 903],
    [1837.2, 903, 0]
  ]
};

describe('MatrixTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    cleanup();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new MatrixTool().run({
      coordinates: [
        { longitude: -74.102094, latitude: 40.692815 },
        { longitude: -74.1022094, latitude: 40.792815 }
      ],
      profile: 'walking'
    });

    assertHeadersSent(mockFetch);
  });

  it('sends request with correct parameters', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixResponse)
    });

    const tool = new MatrixTool();
    const result = await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 },
        { longitude: -122.48, latitude: 37.73 }
      ],
      profile: 'driving'
    });

    expect(result.isError).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Check that URL contains correct profile and coordinates
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain(
      'directions-matrix/v1/mapbox/driving/-122.42,37.78;-122.45,37.91;-122.48,37.73'
    );
    expect(url).toContain(
      'access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
    );

    assertHeadersSent(mockFetch);
  });

  it('properly includes annotations parameter when specified', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixWithDistanceResponse)
    });

    const tool = new MatrixTool();
    await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 }
      ],
      profile: 'driving',
      annotations: 'duration,distance'
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('annotations=duration%2Cdistance');
  });

  it('properly includes approaches parameter when specified', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixResponse)
    });

    const tool = new MatrixTool();
    await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 },
        { longitude: -122.48, latitude: 37.73 }
      ],
      profile: 'driving',
      approaches: 'curb;unrestricted;curb'
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('approaches=curb%3Bunrestricted%3Bcurb');
  });

  it('properly includes bearings parameter when specified', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixResponse)
    });

    const tool = new MatrixTool();
    await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 }
      ],
      profile: 'driving',
      bearings: '45,90;120,45'
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('bearings=45%2C90%3B120%2C45');
  });

  it('properly includes destinations parameter when specified', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixResponse)
    });

    const tool = new MatrixTool();
    await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 },
        { longitude: -122.48, latitude: 37.73 }
      ],
      profile: 'cycling',
      destinations: '0;2'
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('destinations=0%3B2');
  });

  it('properly includes sources parameter when specified', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixResponse)
    });

    const tool = new MatrixTool();
    await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 },
        { longitude: -122.48, latitude: 37.73 }
      ],
      profile: 'walking',
      sources: '1'
    });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('sources=1');
  });

  it('handles all optional parameters together', async () => {
    const mockFetch = setupFetch({
      json: () => Promise.resolve(sampleMatrixWithDistanceResponse)
    });

    const tool = new MatrixTool();
    const result = await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 },
        { longitude: -122.48, latitude: 37.73 }
      ],
      profile: 'driving',
      annotations: 'distance,duration',
      approaches: 'curb;unrestricted;curb',
      bearings: '45,90;120,45;180,90',
      destinations: '0;2',
      sources: '1'
    });

    expect(result.isError).toBe(false);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('annotations=distance%2Cduration');
    expect(url).toContain('approaches=curb%3Bunrestricted%3Bcurb');
    expect(url).toContain('bearings=45%2C90%3B120%2C45%3B180%2C90');
    expect(url).toContain('destinations=0%3B2');
    expect(url).toContain('sources=1');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const tool = new MatrixTool();
    const result = await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.45, latitude: 37.91 }
      ],
      profile: 'walking'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Request failed with status 404: Not Found'
    });

    assertHeadersSent(mockFetch);
  });

  it('validates driving-traffic profile coordinate limit', async () => {
    const mockFetch = setupFetch();

    const tool = new MatrixTool();
    const coordinates = Array(11).fill({ longitude: -122.42, latitude: 37.78 });

    const result = await tool.run({
      coordinates,
      profile: 'driving-traffic'
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();

    // Test for specific error message by calling execute directly
    await expect(async () => {
      await tool['execute'](
        {
          coordinates,
          profile: 'driving-traffic'
        },
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
      );
    }).rejects.toThrow(
      'The driving-traffic profile supports a maximum of 10 coordinate pairs.'
    );
  });

  // Input validation tests
  describe('input validation', () => {
    let tool: MatrixTool;

    beforeEach(() => {
      tool = new MatrixTool();
      setupFetch();
    });

    it('validates coordinates - minimum count', async () => {
      const result = await tool.run({
        coordinates: [{ longitude: -122.42, latitude: 37.78 }],
        profile: 'driving'
      });

      expect(result.isError).toBe(true);

      // Test direct error message using Zod validation from schema
      await expect(async () => {
        await tool['inputSchema'].parseAsync({
          coordinates: [{ longitude: -122.42, latitude: 37.78 }],
          profile: 'driving'
        });
      }).rejects.toThrow('At least two coordinate pairs are required.');
    });

    it('validates coordinates - maximum count for regular profiles', async () => {
      const coordinates = Array(26).fill({
        longitude: -122.42,
        latitude: 37.78
      });
      const result = await tool.run({
        coordinates,
        profile: 'driving'
      });

      expect(result.isError).toBe(true);

      // Test direct error message using Zod validation from schema
      await expect(async () => {
        await tool['inputSchema'].parseAsync({
          coordinates,
          profile: 'driving'
        });
      }).rejects.toThrow(
        'Up to 25 coordinate pairs are supported for most profiles (10 for driving-traffic).'
      );
    });

    it('validates coordinate bounds', async () => {
      const invalidLongitude = await tool.run({
        coordinates: [
          { longitude: -190, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving'
      });
      expect(invalidLongitude.isError).toBe(true);

      // Test longitude bounds error message
      await expect(async () => {
        await tool['inputSchema'].parseAsync({
          coordinates: [
            { longitude: -190, latitude: 37.78 },
            { longitude: -122.45, latitude: 37.91 }
          ],
          profile: 'driving'
        });
      }).rejects.toThrow('Longitude must be between -180 and 180 degrees');

      const invalidLatitude = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 95 }
        ],
        profile: 'driving'
      });
      expect(invalidLatitude.isError).toBe(true);

      // Test latitude bounds error message
      await expect(async () => {
        await tool['inputSchema'].parseAsync({
          coordinates: [
            { longitude: -122.42, latitude: 37.78 },
            { longitude: -122.45, latitude: 95 }
          ],
          profile: 'driving'
        });
      }).rejects.toThrow('Latitude must be between -90 and 90 degrees');
    });

    it('validates approaches parameter length', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 },
          { longitude: -122.48, latitude: 37.73 }
        ],
        profile: 'driving',
        approaches: 'curb;unrestricted' // Only 2 for 3 coordinates
      });

      expect(result.isError).toBe(true);

      // Test direct error for approaches length mismatch
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 },
              { longitude: -122.48, latitude: 37.73 }
            ],
            profile: 'driving',
            approaches: 'curb;unrestricted'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'When provided, the number of approaches (including empty/skipped) must match the number of coordinates.'
      );
    });

    it('validates approaches parameter values', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        approaches: 'curb;invalid' // 'invalid' is not allowed
      });

      expect(result.isError).toBe(true);

      // Test direct error for invalid approach value
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            approaches: 'curb;invalid'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'Approaches parameter contains invalid values. Each value must be either "curb" or "unrestricted".'
      );
    });

    it('validates bearings parameter length', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 },
          { longitude: -122.48, latitude: 37.73 }
        ],
        profile: 'driving',
        bearings: '45,90;120,45' // Only 2 for 3 coordinates
      });

      expect(result.isError).toBe(true);

      // Test direct error for bearings length mismatch
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 },
              { longitude: -122.48, latitude: 37.73 }
            ],
            profile: 'driving',
            bearings: '45,90;120,45'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'When provided, the number of bearings (including empty/skipped) must match the number of coordinates.'
      );
    });

    it('validates bearings parameter format', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        bearings: '45,90;invalid'
      });

      expect(result.isError).toBe(true);

      // Test direct error for invalid bearing format
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            bearings: '45,90;invalid'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow('Invalid bearings format at index 1');
    });

    it('validates bearings parameter angle range', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        bearings: '400,90;120,45' // 400 is > 360
      });

      expect(result.isError).toBe(true);

      // Test direct error for invalid bearing angle
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            bearings: '400,90;120,45'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow('Invalid bearing angle at index 0');
    });

    it('validates bearings parameter degrees range', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        bearings: '45,200;120,45' // 200 is > 180
      });

      expect(result.isError).toBe(true);

      // Test direct error for invalid bearing degrees
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            bearings: '45,200;120,45'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow('Invalid bearing degrees at index 0');
    });

    it('validates sources parameter indices', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        sources: '0;2' // 2 is out of bounds
      });

      expect(result.isError).toBe(true);

      // Test direct error message for invalid sources indices
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            sources: '0;2'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'Sources parameter contains invalid indices. All indices must be between 0 and 1.'
      );
    });

    it('validates destinations parameter indices', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        destinations: '3' // 3 is out of bounds
      });

      expect(result.isError).toBe(true);

      // Test direct error message for invalid destinations indices
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            destinations: '3'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'Destinations parameter contains invalid indices. All indices must be between 0 and 1.'
      );
    });

    it('validates destinations parameter index negative', async () => {
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        destinations: '-1'
      });

      expect(result.isError).toBe(true);

      // Test direct error message for invalid destinations indices
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 }
            ],
            profile: 'driving',
            destinations: '-1'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'Destinations parameter contains invalid indices. All indices must be between 0 and 1.'
      );
    });

    it('accepts valid "all" value for sources', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        sources: 'all'
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('sources=all');
    });

    it('accepts valid "all" value for destinations', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        destinations: 'all'
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('destinations=all');
    });
  });

  // Parameter edge cases
  describe('parameter edge cases', () => {
    let tool: MatrixTool;
    beforeEach(() => {
      tool = new MatrixTool();
    });

    it('accepts approaches with skipped values', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.46, latitude: 37.9 },
          { longitude: -122.48, latitude: 37.73 }
        ],
        profile: 'driving',
        approaches: 'curb;;unrestricted'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('approaches=curb%3B%3Bunrestricted');
    });

    it('accepts bearings with skipped values', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.46, latitude: 37.9 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        bearings: '45,90;;120,45'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('bearings=45%2C90%3B%3B120%2C45');
    });

    it('validates empty values correctly in approaches', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const resultWithSuccess1 = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 },
          { longitude: -122.48, latitude: 37.73 }
        ],
        profile: 'driving',
        approaches: 'curb;;unrestricted'
      });

      expect(resultWithSuccess1.isError).toBe(false);

      const resultWithSuccess2 = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        approaches: 'curb;'
      });

      expect(resultWithSuccess2.isError).toBe(false);
    });

    it('rejects sources and destinations with unused coordinates', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });
      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 },
          { longitude: -122.48, latitude: 37.73 }
        ],
        profile: 'driving',
        sources: '1',
        destinations: '2'
      });
      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();

      // Test direct error message for unused coordinates
      await expect(async () => {
        await tool['execute'](
          {
            coordinates: [
              { longitude: -122.42, latitude: 37.78 },
              { longitude: -122.45, latitude: 37.91 },
              { longitude: -122.48, latitude: 37.73 }
            ],
            profile: 'driving',
            sources: '1',
            destinations: '2'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'When specifying both sources and destinations, all coordinates must be used as either a source or destination.'
      );
    });

    it('accepts sources and destinations with single indices when all coordinates are used', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });
      await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        sources: '0',
        destinations: '1'
      });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('sources=0');
      expect(url).toContain('destinations=1');
    });

    it('accepts both annotations orders', async () => {
      const mockFetch1 = setupFetch({
        json: () => Promise.resolve(sampleMatrixWithDistanceResponse)
      });
      await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        annotations: 'duration,distance'
      });
      const url1 = mockFetch1.mock.calls[0][0];
      expect(url1).toContain('annotations=duration%2Cdistance');

      const mockFetch2 = setupFetch({
        json: () => Promise.resolve(sampleMatrixWithDistanceResponse)
      });
      await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving',
        annotations: 'distance,duration'
      });
      const url2 = mockFetch2.mock.calls[0][0];
      expect(url2).toContain('annotations=distance%2Cduration');
    });
  });

  // Large input tests
  describe('large input', () => {
    let tool: MatrixTool;
    beforeEach(() => {
      tool = new MatrixTool();
    });

    it('accepts 25 coordinates for non-driving-traffic profiles', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });
      const coordinates: { longitude: number; latitude: number }[] = Array.from(
        { length: 25 },
        (_, i) => ({
          longitude: -122.42 + i * 0.01,
          latitude: 37.78 + i * 0.01
        })
      );
      const result = await tool.run({
        coordinates,
        profile: 'driving'
      });
      expect(result.isError).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('accepts 10 coordinates for driving-traffic profile', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });
      const coordinates: { longitude: number; latitude: number }[] = Array.from(
        { length: 10 },
        (_, i) => ({
          longitude: -122.42 + i * 0.01,
          latitude: 37.78 + i * 0.01
        })
      );
      const result = await tool.run({
        coordinates,
        profile: 'driving-traffic'
      });
      expect(result.isError).toBe(false);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('rejects 11 coordinates for driving-traffic profile', async () => {
      const mockFetch = setupFetch();
      const coordinates: { longitude: number; latitude: number }[] = Array.from(
        { length: 11 },
        (_, i) => ({
          longitude: -122.42 + i * 0.01,
          latitude: 37.78 + i * 0.01
        })
      );
      const result = await tool.run({
        coordinates,
        profile: 'driving-traffic'
      });
      expect(result.isError).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();

      // Test direct error message for exceeding coordinate limit
      await expect(async () => {
        await tool['execute'](
          {
            coordinates,
            profile: 'driving-traffic'
          },
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
        );
      }).rejects.toThrow(
        'The driving-traffic profile supports a maximum of 10 coordinate pairs.'
      );
    });
  });

  // Test for different profiles
  describe('profiles', () => {
    let tool: MatrixTool;

    beforeEach(() => {
      tool = new MatrixTool();
    });

    it('works with driving-traffic profile', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving-traffic'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('directions-matrix/v1/mapbox/driving-traffic');
    });

    it('works with driving profile', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'driving'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('directions-matrix/v1/mapbox/driving');
    });

    it('works with walking profile', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'walking'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('directions-matrix/v1/mapbox/walking');
    });

    it('works with cycling profile', async () => {
      const mockFetch = setupFetch({
        json: () => Promise.resolve(sampleMatrixResponse)
      });

      const result = await tool.run({
        coordinates: [
          { longitude: -122.42, latitude: 37.78 },
          { longitude: -122.45, latitude: 37.91 }
        ],
        profile: 'cycling'
      });

      expect(result.isError).toBe(false);
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('directions-matrix/v1/mapbox/cycling');
    });
  });
});
