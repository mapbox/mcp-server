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
});
