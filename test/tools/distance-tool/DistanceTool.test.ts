// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { DistanceTool } from '../../../src/tools/distance-tool/DistanceTool.js';
import type { DistanceOutput } from '../../../src/tools/distance-tool/DistanceTool.output.schema.js';
import { structuredOf } from '../../utils/resultTestUtils.js';

describe('DistanceTool', () => {
  const tool = new DistanceTool();

  it('should calculate distance between two points in kilometers', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      to: { longitude: -118.2437, latitude: 34.0522 }, // Los Angeles
      units: 'kilometers'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBeCloseTo(559, 0);
    expect(data.units).toBe('kilometers');
    expect(data.from).toEqual({
      longitude: -122.4194,
      latitude: 37.7749
    });
    expect(data.to).toEqual({
      longitude: -118.2437,
      latitude: 34.0522
    });
  });

  it('should calculate distance in miles', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      to: { longitude: -118.2437, latitude: 34.0522 }, // Los Angeles
      units: 'miles'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBeCloseTo(347, 0);
    expect(data.units).toBe('miles');
  });

  it('should calculate distance in meters', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      to: { longitude: -118.2437, latitude: 34.0522 }, // Los Angeles
      units: 'meters'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBeGreaterThan(559000);
    expect(data.units).toBe('meters');
  });

  it('should default to kilometers when units not specified', async () => {
    const result = await tool.run({
      from: { longitude: -122.4194, latitude: 37.7749 },
      to: { longitude: -118.2437, latitude: 34.0522 }
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.units).toBe('kilometers');
  });

  it('should calculate short distances accurately', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 0.01 }, // ~1.11 km
      units: 'meters'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBeCloseTo(1112, 0);
  });

  it('should handle cross-hemisphere distances', async () => {
    const result = await tool.run({
      from: { longitude: -73.935242, latitude: 40.73061 }, // New York
      to: { longitude: 139.691706, latitude: 35.689487 }, // Tokyo
      units: 'kilometers'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBeCloseTo(10850, 0);
  });

  it('should calculate distance for same point as zero', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0, latitude: 0 },
      units: 'kilometers'
    });
    const data = structuredOf<DistanceOutput>(result);

    expect(data.distance).toBe(0);
  });

  it('should round distance to 3 decimal places', async () => {
    const result = await tool.run({
      from: { longitude: 0, latitude: 0 },
      to: { longitude: 0.001, latitude: 0.001 },
      units: 'kilometers'
    });
    const data = structuredOf<DistanceOutput>(result);

    const distance = data.distance as number;
    const decimalPlaces = (distance.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });
});
