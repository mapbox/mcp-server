// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { PointInPolygonTool } from '../../../src/tools/point-in-polygon-tool/PointInPolygonTool.js';

describe('PointInPolygonTool', () => {
  const tool = new PointInPolygonTool();

  it('should detect point inside a simple square polygon', async () => {
    const result = await tool.run({
      point: { longitude: 0, latitude: 0 },
      polygon: [
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
    expect(result.structuredContent?.point).toEqual({
      longitude: 0,
      latitude: 0
    });
  });

  it('should detect point outside a simple square polygon', async () => {
    const result = await tool.run({
      point: { longitude: 5, latitude: 5 },
      polygon: [
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(false);
  });

  it('should handle complex polygon shapes', async () => {
    // San Francisco city boundary approximation
    const result = await tool.run({
      point: { longitude: -122.4194, latitude: 37.7749 }, // SF downtown
      polygon: [
        [
          [-122.5, 37.7],
          [-122.3, 37.7],
          [-122.3, 37.8],
          [-122.5, 37.8],
          [-122.5, 37.7]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle polygons with holes - point in hole', async () => {
    const result = await tool.run({
      point: { longitude: 0.5, latitude: 0.5 },
      polygon: [
        // Outer ring
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2]
        ],
        // Inner ring (hole) - note: hole rings go counterclockwise
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(false);
  });

  it('should handle polygons with holes - point in polygon but not in hole', async () => {
    const result = await tool.run({
      point: { longitude: 1.5, latitude: 1.5 },
      polygon: [
        // Outer ring
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2]
        ],
        // Inner ring (hole) - note: hole rings go counterclockwise
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle triangle polygon', async () => {
    const result = await tool.run({
      point: { longitude: 0.5, latitude: 0.3 },
      polygon: [
        [
          [0, 0],
          [1, 0],
          [0.5, 1],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle point on polygon edge as inside', async () => {
    const result = await tool.run({
      point: { longitude: 0, latitude: -1 },
      polygon: [
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle large polygons with many vertices', async () => {
    // Create a polygon with many vertices around a center point
    const points: [number, number][] = [];
    const centerLon = 0;
    const centerLat = 0;
    const segments = 20; // Fewer segments to avoid issues

    for (let i = 0; i < segments; i++) {
      const angle = (i * 2 * Math.PI) / segments;
      const lon = centerLon + Math.cos(angle);
      const lat = centerLat + Math.sin(angle);
      points.push([lon, lat]);
    }
    // Close the polygon
    points.push(points[0]);

    const result = await tool.run({
      point: { longitude: 0, latitude: 0 },
      polygon: [points]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle negative coordinates', async () => {
    const result = await tool.run({
      point: { longitude: -100, latitude: -50 },
      polygon: [
        [
          [-120, -60],
          [-80, -60],
          [-80, -40],
          [-120, -40],
          [-120, -60]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });

  it('should handle point at extreme coordinates', async () => {
    const result = await tool.run({
      point: { longitude: 0, latitude: 85 },
      polygon: [
        [
          [-10, 80],
          [10, 80],
          [10, 89],
          [-10, 89],
          [-10, 80]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.inside).toBe(true);
  });
});
