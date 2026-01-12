// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { CentroidTool } from '../../../src/tools/centroid-tool/CentroidTool.js';

describe('CentroidTool', () => {
  const tool = new CentroidTool();

  it('should calculate centroid of a square polygon centered at origin', async () => {
    const result = await tool.run({
      geometry: [
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
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(0, 1);
  });

  it('should calculate centroid of a triangle', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [6, 0],
          [3, 6],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid of triangle should be at (3, 2)
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(3, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(2, 1);
  });

  it('should calculate centroid of a rectangle', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should be at (5, 2.5)
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(5, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(2.5, 1);
  });

  it('should calculate centroid of polygon with real coordinates', async () => {
    // Approximate San Francisco city boundary
    const result = await tool.run({
      geometry: [
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
    // Centroid should be roughly in the middle of SF
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(-122.4, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(37.75, 1);
  });

  it('should calculate centroid of polygon with hole', async () => {
    const result = await tool.run({
      geometry: [
        // Outer ring
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2]
        ],
        // Inner ring (hole)
        [
          [-1, -1],
          [-1, 1],
          [1, 1],
          [1, -1],
          [-1, -1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should still be at center, even though there's a hole
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(0, 1);
  });

  it('should calculate centroid of multipolygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          // First polygon
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0]
          ]
        ],
        [
          // Second polygon
          [
            [3, 0],
            [5, 0],
            [5, 2],
            [3, 2],
            [3, 0]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should be between the two squares
    expect(result.structuredContent?.centroid.longitude).toBeGreaterThan(1);
    expect(result.structuredContent?.centroid.longitude).toBeLessThan(4);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(1, 1);
  });

  it('should handle polygon in southern hemisphere', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-60, -30],
          [-50, -30],
          [-50, -20],
          [-60, -20],
          [-60, -30]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(-55, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(-25, 1);
  });

  it('should handle L-shaped polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 2],
          [0, 2],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should be somewhere in the L shape
    expect(result.structuredContent?.centroid.longitude).toBeGreaterThan(0);
    expect(result.structuredContent?.centroid.longitude).toBeLessThan(2);
    expect(result.structuredContent?.centroid.latitude).toBeGreaterThan(0);
    expect(result.structuredContent?.centroid.latitude).toBeLessThan(2);
  });

  it('should round coordinates to 6 decimal places', async () => {
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
    const lon = result.structuredContent?.centroid.longitude as number;
    const lat = result.structuredContent?.centroid.latitude as number;
    const lonDecimals = (lon.toString().split('.')[1] || '').length;
    const latDecimals = (lat.toString().split('.')[1] || '').length;
    expect(lonDecimals).toBeLessThanOrEqual(6);
    expect(latDecimals).toBeLessThanOrEqual(6);
  });

  it('should handle pentagon polygon', async () => {
    // Regular pentagon centered at origin
    const result = await tool.run({
      geometry: [
        [
          [0, 1],
          [0.951, 0.309],
          [0.588, -0.809],
          [-0.588, -0.809],
          [-0.951, 0.309],
          [0, 1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should be at center
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(0, 1);
  });

  it('should handle polygon crossing antimeridian', async () => {
    const result = await tool.run({
      geometry: [
        [
          [170, -10],
          [-170, -10],
          [-170, 10],
          [170, 10],
          [170, -10]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid calculation may vary with antimeridian crossing
    // Just check it's a valid coordinate
    expect(result.structuredContent?.centroid.latitude).toBeGreaterThanOrEqual(
      -90
    );
    expect(result.structuredContent?.centroid.latitude).toBeLessThanOrEqual(90);
    expect(result.structuredContent?.centroid.longitude).toBeGreaterThanOrEqual(
      -180
    );
    expect(result.structuredContent?.centroid.longitude).toBeLessThanOrEqual(
      180
    );
  });

  it('should handle very small polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.001, 0],
          [0.001, 0.001],
          [0, 0.001],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(0.0005, 4);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(0.0005, 4);
  });

  it('should handle large polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-120, 20],
          [-80, 20],
          [-80, 50],
          [-120, 50],
          [-120, 20]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.centroid.longitude).toBeCloseTo(-100, 1);
    expect(result.structuredContent?.centroid.latitude).toBeCloseTo(35, 1);
  });

  it('should handle complex irregular polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [4, 0],
          [5, 2],
          [4, 4],
          [2, 5],
          [0, 4],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    // Centroid should be somewhere inside or near the polygon
    expect(result.structuredContent?.centroid.longitude).toBeGreaterThan(0);
    expect(result.structuredContent?.centroid.longitude).toBeLessThan(5);
    expect(result.structuredContent?.centroid.latitude).toBeGreaterThan(0);
    expect(result.structuredContent?.centroid.latitude).toBeLessThan(5);
  });
});
