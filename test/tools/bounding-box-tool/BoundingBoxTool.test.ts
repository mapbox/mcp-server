// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { BoundingBoxTool } from '../../../src/tools/bounding-box-tool/BoundingBoxTool.js';

describe('BoundingBoxTool', () => {
  const tool = new BoundingBoxTool();

  it('should calculate bbox for a single point', async () => {
    const result = await tool.run({
      geometry: [10, 20]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([10, 20, 10, 20]);
  });

  it('should calculate bbox for a linestring', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [10, 5],
        [5, 10]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 10, 10]);
  });

  it('should calculate bbox for a polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 10, 10]);
  });

  it('should calculate bbox for a polygon with hole', async () => {
    const result = await tool.run({
      geometry: [
        // Outer ring
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10]
        ],
        // Inner ring (hole) - should not affect bbox
        [
          [-5, -5],
          [-5, 5],
          [5, 5],
          [5, -5],
          [-5, -5]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // BBox should be based on outer ring only
    expect(result.structuredContent?.bbox).toEqual([-10, -10, 10, 10]);
  });

  it('should calculate bbox for a multipolygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          // First polygon
          [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0]
          ]
        ],
        [
          // Second polygon
          [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
            [10, 10]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // BBox should encompass both polygons
    expect(result.structuredContent?.bbox).toEqual([0, 0, 20, 20]);
  });

  it('should calculate bbox for irregular polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [1, 2],
          [8, 3],
          [9, 7],
          [5, 9],
          [2, 6],
          [1, 2]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([1, 2, 9, 9]);
  });

  it('should calculate bbox for negative coordinates', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-120, -30],
          [-110, -30],
          [-110, -20],
          [-120, -20],
          [-120, -30]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([-120, -30, -110, -20]);
  });

  it('should calculate bbox crossing the equator and prime meridian', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([-10, -10, 10, 10]);
  });

  it('should calculate bbox for real world coordinates (San Francisco)', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-122.52, 37.7],
          [-122.35, 37.7],
          [-122.35, 37.82],
          [-122.52, 37.82],
          [-122.52, 37.7]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox[0]).toBeCloseTo(-122.52, 5);
    expect(result.structuredContent?.bbox[1]).toBeCloseTo(37.7, 5);
    expect(result.structuredContent?.bbox[2]).toBeCloseTo(-122.35, 5);
    expect(result.structuredContent?.bbox[3]).toBeCloseTo(37.82, 5);
  });

  it('should calculate bbox near poles', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 85],
          [90, 85],
          [90, 89],
          [0, 89],
          [0, 85]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 85, 90, 89]);
  });

  it('should round bbox coordinates to 6 decimal places', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0.123456789, 0.987654321],
          [1.23456789, 0.987654321],
          [1.23456789, 1.87654321],
          [0.123456789, 1.87654321],
          [0.123456789, 0.987654321]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    const bbox = result.structuredContent?.bbox as number[];
    bbox.forEach((coord) => {
      const decimalPlaces = (coord.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(6);
    });
  });

  it('should calculate bbox for very small geometries', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.0001, 0],
          [0.0001, 0.0001],
          [0, 0.0001],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 0.0001, 0.0001]);
  });

  it('should calculate bbox for very large geometries', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([-180, -90, 180, 90]);
  });

  it('should calculate bbox for diagonal line', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [10, 10]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 10, 10]);
  });

  it('should calculate bbox for horizontal line', async () => {
    const result = await tool.run({
      geometry: [
        [0, 5],
        [10, 5]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 5, 10, 5]);
  });

  it('should calculate bbox for vertical line', async () => {
    const result = await tool.run({
      geometry: [
        [5, 0],
        [5, 10]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([5, 0, 5, 10]);
  });

  it('should calculate bbox for zigzag linestring', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [5, 10],
        [10, 0],
        [15, 10],
        [20, 0]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 20, 10]);
  });

  it('should handle triangle polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [10, 0],
          [5, 10],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bbox).toEqual([0, 0, 10, 10]);
  });

  it('should calculate bbox format as [minLon, minLat, maxLon, maxLat]', async () => {
    const result = await tool.run({
      geometry: [
        [10, 20],
        [30, 40]
      ]
    });

    expect(result.isError).toBe(false);
    const bbox = result.structuredContent?.bbox as number[];
    // Verify format: [west, south, east, north]
    expect(bbox[0]).toBeLessThanOrEqual(bbox[2]); // minLon <= maxLon
    expect(bbox[1]).toBeLessThanOrEqual(bbox[3]); // minLat <= maxLat
  });
});
