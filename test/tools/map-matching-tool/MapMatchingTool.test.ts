// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { MapMatchingTool } from '../../../src/tools/map-matching-tool/MapMatchingTool.js';
import { tokenFor } from '../../utils/tokenTestUtils.js';

const sampleMapMatchingResponse = {
  code: 'Ok',
  matchings: [
    {
      confidence: 0.95,
      distance: 1234.5,
      duration: 123.4,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-122.4194, 37.7749],
          [-122.4195, 37.775],
          [-122.4197, 37.7751]
        ]
      },
      legs: [
        {
          distance: 617.25,
          duration: 61.7,
          annotation: {
            speed: [50, 45],
            distance: [300, 317.25],
            duration: [21.6, 40.1]
          }
        }
      ]
    }
  ],
  tracepoints: [
    {
      name: 'Market Street',
      location: [-122.4194, 37.7749],
      waypoint_index: 0,
      matchings_index: 0,
      alternatives_count: 0
    },
    {
      name: 'Market Street',
      location: [-122.4195, 37.775],
      matchings_index: 0,
      alternatives_count: 1
    },
    {
      name: 'Valencia Street',
      location: [-122.4197, 37.7751],
      matchings_index: 0,
      alternatives_count: 0
    }
  ]
};

describe('MapMatchingTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await new MapMatchingTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving'
    });

    assertHeadersSent(mockHttpRequest);
  });

  it('returns structured content for valid coordinates', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ],
      profile: 'driving'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toMatchObject({
      code: 'Ok',
      matchings: expect.arrayContaining([
        expect.objectContaining({
          confidence: expect.any(Number),
          distance: expect.any(Number),
          duration: expect.any(Number)
        })
      ]),
      tracepoints: expect.any(Array)
    });
  });

  it('includes timestamps when provided', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      timestamps: [1234567890, 1234567900]
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('timestamps=1234567890%3B1234567900');
  });

  it('includes radiuses when provided', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      radiuses: [25, 25]
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('radiuses=25%3B25');
  });

  it('includes annotations when provided', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      annotations: ['speed', 'congestion']
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('annotations=speed%2Ccongestion');
  });

  it('returns error when timestamps length does not match coordinates', async () => {
    const { httpRequest } = setupHttpRequest();

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      timestamps: [1234567890] // Wrong length
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(
        'timestamps array must have the same length'
      )
    });
  });

  it('returns error when radiuses length does not match coordinates', async () => {
    const { httpRequest } = setupHttpRequest();

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      radiuses: [25, 25, 25] // Wrong length
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('radiuses array must have the same length')
    });
  });

  it('returns error when timestamps are not ascending', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      timestamps: [1700000000, 1700000000]
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('strictly ascending order')
    });
  });

  it('rejects a radius of 0, which the API refuses', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving',
      radiuses: [0, 0]
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it('points to directions_tool when the points are too far apart', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () =>
        JSON.stringify({
          code: 'InvalidInput',
          message: 'All coordinates are too far away from each other'
        })
    });

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -118.24, latitude: 34.05 }
      ],
      profile: 'driving'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('use directions_tool instead')
    });
  });

  it('supports different routing profiles', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'cycling'
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('/matching/v5/mapbox/cycling/');
  });

  it('returns a graceful error when the API cannot match the trace', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({ code: 'NoMatch' })
    });

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4783, latitude: 37.8199 }
      ],
      profile: 'walking'
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/NoMatch.*directions_tool/)
    });
  });

  it('returns a graceful error when the API responds Ok but with a schema-invalid payload', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({
        code: 'Ok',
        // confidence must be between 0 and 1 - this violates MapMatchingOutputSchema
        matchings: [{ confidence: 5, distance: 100, duration: 10 }],
        tracepoints: []
      })
    });

    const tool = new MapMatchingTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving'
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining("didn't match the expected format")
    });
  });

  it('uses geojson geometries by default', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => sampleMapMatchingResponse
    });

    const tool = new MapMatchingTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'driving'
    });

    const callUrl = mockHttpRequest.mock.calls[0][0] as string;
    expect(callUrl).toContain('geometries=geojson');
  });

  it("attaches a self-fetch mapboxRender ref that carries the call's own params (not server-computed geometry)", async () => {
    const fakeResp = {
      code: 'Ok',
      matchings: [
        {
          confidence: 0.9,
          distance: 200,
          duration: 60,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-122.4194, 37.7749],
              [-122.4195, 37.775]
            ]
          }
        }
      ],
      tracepoints: [
        {
          name: '',
          location: [-122.4194, 37.7749],
          matchings_index: 0,
          alternatives_count: 0
        },
        {
          name: '',
          location: [-122.4195, 37.775],
          matchings_index: 0,
          alternatives_count: 0
        }
      ]
    };
    const { httpRequest } = setupHttpRequest({
      ok: true,
      json: async () => fakeResp
    });

    const token = tokenFor('account-test-map-matching');
    const result = await new MapMatchingTool({ httpRequest }).run(
      {
        coordinates: [
          { longitude: -122.4194, latitude: 37.7749 },
          { longitude: -122.4195, latitude: 37.775 }
        ],
        profile: 'driving'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { http: { authInfo: { token } } } as any
    );

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { mapboxRender?: { ref?: string } };
    expect(sc.mapboxRender?.ref).toMatch(
      /^mapbox:\/\/selffetch\/map_matching\?data=/
    );

    // The ref is self-describing (no server-side store, no owner needed)
    // — resolving it doesn't depend on this test's `token`/account at all.
    const { resolveSelfFetchRef } =
      await import('../../../src/utils/selfFetchRef.js');
    const payload = resolveSelfFetchRef(sc.mapboxRender!.ref!);
    expect(payload?.selfFetch).toEqual([
      {
        tool: 'map_matching',
        params: expect.objectContaining({
          coordinates: [
            { longitude: -122.4194, latitude: 37.7749 },
            { longitude: -122.4195, latitude: 37.775 }
          ],
          profile: 'driving'
        })
      }
    ]);
  });
});
