// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { ConvexTool } from '../../../src/tools/convex-tool/ConvexTool.js';

describe('ConvexTool', () => {
  const tool = new ConvexTool();

  it('computes a convex hull from a set of points', async () => {
    const result = await tool.run({
      points: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 0 },
        { longitude: 1, latitude: 1 },
        { longitude: 0, latitude: 1 },
        { longitude: 0.5, latitude: 0.5 } // interior point — should not affect hull
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.geometry).not.toBeNull();
    expect(result.structuredContent?.num_points).toBe(5);
    // Hull of a square is a polygon
    expect((result.structuredContent?.geometry as { type: string })?.type).toBe(
      'Polygon'
    );
  });

  it('returns null geometry for collinear points', async () => {
    const result = await tool.run({
      points: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 0 },
        { longitude: 2, latitude: 0 } // all on a straight line
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.geometry).toBeNull();
    expect(result.structuredContent?.num_points).toBe(3);
  });

  it('works with real-world points', async () => {
    // Several cities in the western US
    const result = await tool.run({
      points: [
        { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
        { longitude: -118.2437, latitude: 34.0522 }, // Los Angeles
        { longitude: -112.074, latitude: 33.4484 }, // Phoenix
        { longitude: -104.9903, latitude: 39.7392 }, // Denver
        { longitude: -115.1398, latitude: 36.1699 } // Las Vegas
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.geometry).not.toBeNull();
    expect(result.structuredContent?.num_points).toBe(5);
  });

  it('rejects fewer than three points', async () => {
    const result = await tool.run({
      points: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 1 }
      ]
    });

    expect(result.isError).toBe(true);
  });

  it('text content describes the result', async () => {
    const withHull = await tool.run({
      points: [
        { longitude: 0, latitude: 0 },
        { longitude: 1, latitude: 0 },
        { longitude: 0.5, latitude: 1 }
      ]
    });
    expect((withHull.content[0] as { text: string }).text).toContain(
      'Convex hull computed'
    );
  });
});
