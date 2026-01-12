// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { MidpointTool } from '../../../src/tools/midpoint-tool/MidpointTool.js';

describe('MidpointTool', () => {
  const tool = new MidpointTool();

  it('should calculate midpoint between two points on equator', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 10, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(5, 1);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.from).toEqual({
      longitude: 0,
      latitude: 0
    });
    expect(result.structuredContent?.to).toEqual({
      longitude: 10,
      latitude: 0
    });
  });

  it('should calculate midpoint between two points on same meridian', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 10 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(5, 1);
  });

  it('should calculate midpoint for diagonal coordinates', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 10, latitude: 10 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(5, 1);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(5, 1);
  });

  it('should calculate midpoint between San Francisco and Los Angeles', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      to: { longitude: -118.2437, latitude: 34.0522 } // Los Angeles
    });

    expect(result.isError).toBe(false);
    // Midpoint should be roughly between the two cities
    expect(result.structuredContent?.midpoint.longitude).toBeGreaterThan(-121);
    expect(result.structuredContent?.midpoint.longitude).toBeLessThan(-119);
    expect(result.structuredContent?.midpoint.latitude).toBeGreaterThan(35);
    expect(result.structuredContent?.midpoint.latitude).toBeLessThan(37);
  });

  it('should calculate midpoint between New York and London', async () => {
    const result = await tool.run({
      from: { longitude: -74.006, latitude: 40.7128 }, // New York
      to: { longitude: -0.1276, latitude: 51.5074 } // London
    });

    expect(result.isError).toBe(false);
    // Midpoint should be somewhere over the Atlantic
    expect(result.structuredContent?.midpoint.longitude).toBeGreaterThan(-74);
    expect(result.structuredContent?.midpoint.longitude).toBeLessThan(0);
    expect(result.structuredContent?.midpoint.latitude).toBeGreaterThan(40);
    expect(result.structuredContent?.midpoint.latitude).toBeLessThan(60);
  });

  it('should handle same point as same midpoint', async () => {
    const result = await tool.run({
      from: { longitude: 10, latitude: 20 },
      to: { longitude: 10, latitude: 20 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBe(10);
    expect(result.structuredContent?.midpoint.latitude).toBe(20);
  });

  it('should handle midpoint across the antimeridian (180°)', async () => {
    const result = await tool.run({
      from: { longitude: 170, latitude: 0 },
      to: { longitude: -170, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    // Midpoint should be near 180° or -180°
    expect(
      Math.abs(result.structuredContent?.midpoint.longitude || 0)
    ).toBeGreaterThan(175);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0, 1);
  });

  it('should handle midpoint near the north pole', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 85 },
      to: { longitude: 90, latitude: 85 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.latitude).toBeGreaterThan(84);
    expect(result.structuredContent?.midpoint.latitude).toBeLessThan(90);
  });

  it('should handle midpoint in southern hemisphere', async () => {
    const result = await tool.run({
      from: { longitude: -60, latitude: -30 },
      to: { longitude: -50, latitude: -40 }
    });

    expect(result.isError).toBe(false);
    // Midpoint should be between the two points
    expect(result.structuredContent?.midpoint.longitude).toBeGreaterThan(-60);
    expect(result.structuredContent?.midpoint.longitude).toBeLessThan(-50);
    expect(result.structuredContent?.midpoint.latitude).toBeGreaterThan(-40);
    expect(result.structuredContent?.midpoint.latitude).toBeLessThan(-30);
  });

  it('should handle midpoint across hemispheres (N-S)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 20 },
      to: { longitude: 0, latitude: -20 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0, 1);
  });

  it('should handle midpoint across hemispheres (E-W)', async () => {
    const result = await tool.run({
      from: { longitude: 20, latitude: 0 },
      to: { longitude: -20, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0, 1);
  });

  it('should round coordinates to 6 decimal places', async () => {
    const result = await tool.run({
      from: { longitude: 0.123456789, latitude: 0.987654321 },
      to: { longitude: 1.23456789, latitude: 1.87654321 }
    });

    expect(result.isError).toBe(false);
    const lon = result.structuredContent?.midpoint.longitude as number;
    const lat = result.structuredContent?.midpoint.latitude as number;
    const lonDecimals = (lon.toString().split('.')[1] || '').length;
    const latDecimals = (lat.toString().split('.')[1] || '').length;
    expect(lonDecimals).toBeLessThanOrEqual(6);
    expect(latDecimals).toBeLessThanOrEqual(6);
  });

  it('should handle extreme coordinate ranges', async () => {
    const result = await tool.run({
      from: { longitude: -180, latitude: -90 },
      to: { longitude: 180, latitude: 90 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0, 1);
  });

  it('should be commutative (same midpoint regardless of order)', async () => {
    const result1 = await tool.run({
      from: { longitude: 10, latitude: 20 },
      to: { longitude: 30, latitude: 40 }
    });

    const result2 = await tool.run({
      from: { longitude: 30, latitude: 40 },
      to: { longitude: 10, latitude: 20 }
    });

    expect(result1.structuredContent?.midpoint.longitude).toBeCloseTo(
      result2.structuredContent?.midpoint.longitude || 0,
      5
    );
    expect(result1.structuredContent?.midpoint.latitude).toBeCloseTo(
      result2.structuredContent?.midpoint.latitude || 0,
      5
    );
  });

  it('should handle short distances accurately', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0.001, latitude: 0.001 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.midpoint.longitude).toBeCloseTo(0.0005, 4);
    expect(result.structuredContent?.midpoint.latitude).toBeCloseTo(0.0005, 4);
  });
});
