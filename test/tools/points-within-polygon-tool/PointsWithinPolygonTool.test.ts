// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { PointsWithinPolygonTool } from '../../../src/tools/points-within-polygon-tool/PointsWithinPolygonTool.js';

// Simple unit square polygon [0,0] → [1,1]
const SQUARE = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0]
  ]
];

describe('PointsWithinPolygonTool', () => {
  const tool = new PointsWithinPolygonTool();

  it('returns points inside the polygon', async () => {
    const result = await tool.run({
      points: [
        { longitude: 0.5, latitude: 0.5 }, // inside
        { longitude: 2, latitude: 2 } // outside
      ],
      polygon: SQUARE
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(1);
    expect(result.structuredContent?.total).toBe(2);
    expect(result.structuredContent?.points_within[0]).toMatchObject({
      longitude: 0.5,
      latitude: 0.5
    });
  });

  it('returns all points when all are inside', async () => {
    const result = await tool.run({
      points: [
        { longitude: 0.2, latitude: 0.2 },
        { longitude: 0.5, latitude: 0.5 },
        { longitude: 0.8, latitude: 0.8 }
      ],
      polygon: SQUARE
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(3);
    expect(result.structuredContent?.total).toBe(3);
  });

  it('returns empty when no points are inside', async () => {
    const result = await tool.run({
      points: [
        { longitude: 2, latitude: 2 },
        { longitude: -1, latitude: -1 }
      ],
      polygon: SQUARE
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(0);
    expect(result.structuredContent?.total).toBe(2);
    expect(result.structuredContent?.points_within).toHaveLength(0);
  });

  it('handles a single point inside', async () => {
    const result = await tool.run({
      points: [{ longitude: 0.5, latitude: 0.5 }],
      polygon: SQUARE
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(1);
  });

  it('works with a real-world polygon', async () => {
    // Rough bounding box around Manhattan
    const manhattan = [
      [
        [-74.02, 40.7],
        [-73.97, 40.7],
        [-73.97, 40.78],
        [-74.02, 40.78],
        [-74.02, 40.7]
      ]
    ];

    const result = await tool.run({
      points: [
        { longitude: -73.985, latitude: 40.748 }, // Midtown — inside
        { longitude: -118.2437, latitude: 34.0522 } // Los Angeles — outside
      ],
      polygon: manhattan
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(1);
  });

  it('excludes points that fall inside a hole', async () => {
    // Outer ring: [0,0] → [4,4]; inner ring (hole): [1,1] → [3,3]
    const polygonWithHole = [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0]
      ],
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1]
      ]
    ];

    const result = await tool.run({
      points: [
        { longitude: 0.5, latitude: 0.5 }, // inside outer ring, outside hole → inside
        { longitude: 2, latitude: 2 }, // inside hole → NOT inside
        { longitude: 3.5, latitude: 3.5 } // inside outer ring, outside hole → inside
      ],
      polygon: polygonWithHole
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.count).toBe(2);
    expect(result.structuredContent?.total).toBe(3);
    // The hole point (2,2) should not be returned
    const lngs = result.structuredContent?.points_within.map(
      (p) => p.longitude
    );
    expect(lngs).not.toContain(2);
  });

  it('rejects invalid input', async () => {
    const result = await tool.run({
      points: [{ longitude: 200, latitude: 0 }], // longitude out of range
      polygon: SQUARE
    });

    expect(result.isError).toBe(true);
  });
});
