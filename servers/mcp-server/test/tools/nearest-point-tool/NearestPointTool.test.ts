// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { NearestPointTool } from '../../../src/tools/nearest-point-tool/NearestPointTool.js';
import type { NearestPointOutput } from '../../../src/tools/nearest-point-tool/NearestPointTool.output.schema.js';
import { structuredOf } from '../../utils/resultTestUtils.js';

describe('NearestPointTool', () => {
  const tool = new NearestPointTool();

  it('finds the nearest point from a collection', async () => {
    const result = await tool.run({
      target: { longitude: 0, latitude: 0 },
      points: [
        { longitude: 1, latitude: 0 }, // 1 degree away
        { longitude: 5, latitude: 0 }, // 5 degrees away
        { longitude: 10, latitude: 0 } // 10 degrees away
      ]
    });

    expect(result.isError).toBe(false);
    expect(structuredOf<NearestPointOutput>(result).nearest).toMatchObject({
      longitude: 1,
      latitude: 0
    });
    expect(structuredOf<NearestPointOutput>(result).index).toBe(0);
  });

  it('returns correct index for nearest point', async () => {
    const result = await tool.run({
      target: { longitude: 0, latitude: 0 },
      points: [
        { longitude: 10, latitude: 0 }, // far
        { longitude: 20, latitude: 0 }, // farther
        { longitude: 0.5, latitude: 0 } // nearest — index 2
      ]
    });

    expect(result.isError).toBe(false);
    expect(structuredOf<NearestPointOutput>(result).index).toBe(2);
    expect(structuredOf<NearestPointOutput>(result).nearest).toMatchObject({
      longitude: 0.5,
      latitude: 0
    });
  });

  it('defaults to meters units', async () => {
    const result = await tool.run({
      target: { longitude: 0, latitude: 0 },
      points: [{ longitude: 0.001, latitude: 0 }]
    });

    expect(result.isError).toBe(false);
    expect(structuredOf<NearestPointOutput>(result).units).toBe('meters');
    expect(structuredOf<NearestPointOutput>(result).distance).toBeGreaterThan(
      0
    );
  });

  it('returns distance in kilometers when specified', async () => {
    const result = await tool.run({
      target: { longitude: -122.4194, latitude: 37.7749 }, // San Francisco
      points: [
        { longitude: -118.2437, latitude: 34.0522 }, // Los Angeles
        { longitude: -73.935242, latitude: 40.73061 } // New York
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(structuredOf<NearestPointOutput>(result).units).toBe('kilometers');
    // LA is closer to SF than NY
    expect(structuredOf<NearestPointOutput>(result).index).toBe(0);
    expect(structuredOf<NearestPointOutput>(result).distance).toBeCloseTo(
      559,
      0
    );
  });

  it('handles a single candidate point', async () => {
    const result = await tool.run({
      target: { longitude: 0, latitude: 0 },
      points: [{ longitude: 1, latitude: 1 }]
    });

    expect(result.isError).toBe(false);
    expect(structuredOf<NearestPointOutput>(result).index).toBe(0);
  });

  it('rejects empty points array', async () => {
    const result = await tool.run({
      target: { longitude: 0, latitude: 0 },
      points: []
    });

    expect(result.isError).toBe(true);
  });
});
