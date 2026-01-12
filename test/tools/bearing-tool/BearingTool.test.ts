// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { BearingTool } from '../../../src/tools/bearing-tool/BearingTool.js';

describe('BearingTool', () => {
  const tool = new BearingTool();

  it('should calculate bearing for north direction (0°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 1 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeCloseTo(0, 1);
    expect(result.structuredContent?.from).toEqual({
      longitude: 0,
      latitude: 0
    });
    expect(result.structuredContent?.to).toEqual({
      longitude: 0,
      latitude: 1
    });
  });

  it('should calculate bearing for east direction (90°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 1, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeCloseTo(90, 1);
  });

  it('should calculate bearing for south direction (180°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: -1 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeCloseTo(180, 1);
  });

  it('should calculate bearing for west direction (270°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: -1, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeCloseTo(270, 1);
  });

  it('should calculate bearing for northeast direction (45°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 1, latitude: 1 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeGreaterThan(30);
    expect(result.structuredContent?.bearing).toBeLessThan(60);
  });

  it('should calculate bearing for southwest direction (225°)', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: -1, latitude: -1 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeGreaterThan(210);
    expect(result.structuredContent?.bearing).toBeLessThan(240);
  });

  it('should calculate bearing between real cities (SF to LA)', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      to: { longitude: -118.2437, latitude: 34.0522 } // Los Angeles
    });

    expect(result.isError).toBe(false);
    // SF to LA should be roughly southeast
    expect(result.structuredContent?.bearing).toBeGreaterThan(100);
    expect(result.structuredContent?.bearing).toBeLessThan(150);
  });

  it('should calculate bearing between real cities (NY to London)', async () => {
    const result = await tool.run({
      from: { longitude: -74.006, latitude: 40.7128 }, // New York
      to: { longitude: -0.1276, latitude: 51.5074 } // London
    });

    expect(result.isError).toBe(false);
    // NY to London should be roughly northeast
    expect(result.structuredContent?.bearing).toBeGreaterThan(40);
    expect(result.structuredContent?.bearing).toBeLessThan(90);
  });

  it('should handle same point as zero bearing', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBe(0);
  });

  it('should handle bearing across the antimeridian', async () => {
    const result = await tool.run({
      from: { longitude: 179, latitude: 0 },
      to: { longitude: -179, latitude: 0 }
    });

    expect(result.isError).toBe(false);
    // Should be roughly east (90°)
    expect(result.structuredContent?.bearing).toBeGreaterThan(70);
    expect(result.structuredContent?.bearing).toBeLessThan(110);
  });

  it('should handle bearing near poles', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 85 },
      to: { longitude: 90, latitude: 85 }
    });

    expect(result.isError).toBe(false);
    // Near poles, bearings are distorted - just check it's a valid bearing
    expect(result.structuredContent?.bearing).toBeGreaterThanOrEqual(0);
    expect(result.structuredContent?.bearing).toBeLessThan(360);
  });

  it('should round bearing to 2 decimal places', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0.123456, latitude: 0.654321 }
    });

    expect(result.isError).toBe(false);
    const bearing = result.structuredContent?.bearing as number;
    const decimalPlaces = (bearing.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  it('should normalize negative bearings to 0-360 range', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: -1, latitude: 1 }
    });

    expect(result.isError).toBe(false);
    // Should be northwest (between 270-360)
    expect(result.structuredContent?.bearing).toBeGreaterThanOrEqual(0);
    expect(result.structuredContent?.bearing).toBeLessThan(360);
    expect(result.structuredContent?.bearing).toBeGreaterThan(300);
  });

  it('should handle negative coordinates', async () => {
    const result = await tool.run({
      from: { longitude: -100, latitude: -30 },
      to: { longitude: -90, latitude: -20 }
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.bearing).toBeGreaterThanOrEqual(0);
    expect(result.structuredContent?.bearing).toBeLessThan(360);
  });

  it('should calculate reverse bearing correctly', async () => {
    const forwardResult = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 1 }
    });

    const reverseResult = await tool.run({
      from: { longitude: 0, latitude: 1 },
      to: { longitude: 0, latitude: 0 }
    });

    const forwardBearing = forwardResult.structuredContent?.bearing as number;
    const reverseBearing = reverseResult.structuredContent?.bearing as number;

    // Reverse bearing should be ~180° different
    const diff = Math.abs(forwardBearing - reverseBearing);
    expect(diff).toBeCloseTo(180, 0);
  });
});
