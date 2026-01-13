// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { BufferTool } from '../../../src/tools/buffer-tool/BufferTool.js';

describe('BufferTool', () => {
  const tool = new BufferTool();

  it('should create buffer around a point in kilometers (default)', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 1
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.distance).toBe(1);
    expect(result.structuredContent?.units).toBe('kilometers');
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
    expect(Array.isArray(result.structuredContent?.bufferedPolygon)).toBe(true);
    // Should have at least one ring
    expect(result.structuredContent?.bufferedPolygon.length).toBeGreaterThan(0);
    // Outer ring should have multiple vertices (typically 64 for a circle)
    expect(result.structuredContent?.bufferedPolygon[0].length).toBeGreaterThan(
      10
    );
  });

  it('should create buffer around a point in meters', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 1000,
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.distance).toBe(1000);
    expect(result.structuredContent?.units).toBe('meters');
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around a point in miles', async () => {
    const result = await tool.run({
      geometry: [-122.4194, 37.7749], // San Francisco
      distance: 5,
      units: 'miles'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.distance).toBe(5);
    expect(result.structuredContent?.units).toBe('miles');
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around a point in feet', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 5000,
      units: 'feet'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.distance).toBe(5000);
    expect(result.structuredContent?.units).toBe('feet');
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around a linestring', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [1, 1]
      ],
      distance: 0.5,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
    // Buffer around line should have more vertices than around point
    expect(result.structuredContent?.bufferedPolygon[0].length).toBeGreaterThan(
      10
    );
  });

  it('should create buffer around a multi-segment linestring', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
      ],
      distance: 0.1,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around a polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ],
      distance: 0.5,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
    // Buffer around polygon should expand it
    expect(result.structuredContent?.bufferedPolygon[0].length).toBeGreaterThan(
      4
    );
  });

  it('should create buffer around a small polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.001, 0],
          [0.001, 0.001],
          [0, 0.001],
          [0, 0]
        ]
      ],
      distance: 100,
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should handle different buffer distances', async () => {
    const result1 = await tool.run({
      geometry: [0, 0],
      distance: 1,
      units: 'kilometers'
    });

    const result2 = await tool.run({
      geometry: [0, 0],
      distance: 5,
      units: 'kilometers'
    });

    expect(result1.isError).toBe(false);
    expect(result2.isError).toBe(false);
    // Larger buffer should have polygon that extends further from center
    // We can't directly compare areas, but both should succeed
    expect(result1.structuredContent?.bufferedPolygon).toBeDefined();
    expect(result2.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around real world location (NYC)', async () => {
    const result = await tool.run({
      geometry: [-74.006, 40.7128], // New York City
      distance: 10,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
    // Check that buffer is centered roughly around NYC coordinates
    const firstCoord = result.structuredContent?.bufferedPolygon[0][0];
    expect(firstCoord).toBeDefined();
    // Coordinates should be within reasonable range of NYC
    if (firstCoord) {
      expect(firstCoord[0]).toBeGreaterThan(-75);
      expect(firstCoord[0]).toBeLessThan(-73);
      expect(firstCoord[1]).toBeGreaterThan(39);
      expect(firstCoord[1]).toBeLessThan(42);
    }
  });

  it('should create buffer in southern hemisphere', async () => {
    const result = await tool.run({
      geometry: [-58.3816, -34.6037], // Buenos Aires
      distance: 5,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer near the equator', async () => {
    const result = await tool.run({
      geometry: [-78.4678, -0.1807], // Quito, Ecuador
      distance: 10,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer with very small distance', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 10,
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer with large distance', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 100,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should return closed polygon (first and last coordinates match)', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 1,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    const outerRing = result.structuredContent?.bufferedPolygon[0];
    expect(outerRing).toBeDefined();
    if (outerRing) {
      const firstCoord = outerRing[0];
      const lastCoord = outerRing[outerRing.length - 1];
      expect(firstCoord[0]).toBeCloseTo(lastCoord[0], 5);
      expect(firstCoord[1]).toBeCloseTo(lastCoord[1], 5);
    }
  });

  it('should create smooth circular buffer around point', async () => {
    const result = await tool.run({
      geometry: [0, 0],
      distance: 1,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    const outerRing = result.structuredContent?.bufferedPolygon[0];
    expect(outerRing).toBeDefined();
    // Circle should have many vertices for smooth appearance (typically 64)
    if (outerRing) {
      expect(outerRing.length).toBeGreaterThan(32);
    }
  });

  it('should create buffer around triangle polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [0.5, 1],
          [0, 0]
        ]
      ],
      distance: 0.1,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should create buffer around irregular polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [2, 0],
          [3, 1],
          [2, 2],
          [0, 1],
          [0, 0]
        ]
      ],
      distance: 0.5,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });

  it('should handle buffer near poles', async () => {
    const result = await tool.run({
      geometry: [0, 85],
      distance: 10,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bufferedPolygon).toBeDefined();
  });
});
