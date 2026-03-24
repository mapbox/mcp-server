// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { DestinationTool } from '../../../src/tools/destination-tool/DestinationTool.js';

describe('DestinationTool', () => {
  const tool = new DestinationTool();

  it('calculates destination heading north', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 0 },
      distance: 111000, // ~1 degree of latitude in meters
      bearing: 0, // north
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    // Should end up roughly 1 degree north
    expect(result.structuredContent?.destination.latitude).toBeCloseTo(1, 0);
    expect(result.structuredContent?.destination.longitude).toBeCloseTo(0, 1);
  });

  it('calculates destination heading east', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 0 },
      distance: 111000,
      bearing: 90, // east
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.destination.longitude).toBeGreaterThan(0);
    expect(result.structuredContent?.destination.latitude).toBeCloseTo(0, 1);
  });

  it('calculates destination in kilometers', async () => {
    const result = await tool.run({
      origin: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      distance: 100,
      bearing: 0,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // 100km north should increase latitude by ~0.9 degrees
    expect(result.structuredContent?.destination.latitude).toBeGreaterThan(38);
    expect(result.structuredContent?.units).toBe('kilometers');
    expect(result.structuredContent?.distance).toBe(100);
    expect(result.structuredContent?.bearing).toBe(0);
  });

  it('defaults to meters units', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 0 },
      distance: 1000,
      bearing: 0
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('meters');
  });

  it('calculates destination heading south (negative bearing)', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 10 },
      distance: 1000,
      bearing: 180,
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Heading south should decrease latitude
    expect(result.structuredContent?.destination.latitude).toBeLessThan(10);
  });

  it('rejects bearing out of range', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 0 },
      distance: 100,
      bearing: 200, // out of -180..180
      units: 'meters'
    });

    expect(result.isError).toBe(true);
  });

  it('rejects non-positive distance', async () => {
    const result = await tool.run({
      origin: { longitude: 0, latitude: 0 },
      distance: -100,
      bearing: 0,
      units: 'meters'
    });

    expect(result.isError).toBe(true);
  });
});
