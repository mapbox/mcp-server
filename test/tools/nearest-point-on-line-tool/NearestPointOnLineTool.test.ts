// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { NearestPointOnLineTool } from '../../../src/tools/nearest-point-on-line-tool/NearestPointOnLineTool.js';

describe('NearestPointOnLineTool', () => {
  const tool = new NearestPointOnLineTool();

  it('snaps a point to a horizontal line', async () => {
    const result = await tool.run({
      point: { longitude: 0.5, latitude: 1 }, // above the line
      line: [
        [0, 0],
        [1, 0] // horizontal line along equator
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Nearest point on the line should be directly below the input point
    expect(result.structuredContent?.nearest.longitude).toBeCloseTo(0.5, 1);
    expect(result.structuredContent?.nearest.latitude).toBeCloseTo(0, 1);
    expect(result.structuredContent?.distance).toBeGreaterThan(0);
  });

  it('returns zero distance when point is on the line', async () => {
    const result = await tool.run({
      point: { longitude: 0.5, latitude: 0 }, // exactly on the line
      line: [
        [0, 0],
        [1, 0]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.distance).toBeCloseTo(0, 1);
  });

  it('defaults to kilometers units', async () => {
    const result = await tool.run({
      point: { longitude: 0, latitude: 1 },
      line: [
        [0, 0],
        [1, 0]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('kilometers');
  });

  it('returns distance in meters when specified', async () => {
    const km = await tool.run({
      point: { longitude: 0, latitude: 1 },
      line: [
        [0, 0],
        [1, 0]
      ],
      units: 'kilometers'
    });

    const m = await tool.run({
      point: { longitude: 0, latitude: 1 },
      line: [
        [0, 0],
        [1, 0]
      ],
      units: 'meters'
    });

    expect(m.structuredContent?.distance).toBeCloseTo(
      (km.structuredContent?.distance as number) * 1000,
      0
    );
    expect(m.structuredContent?.units).toBe('meters');
  });

  it('returns location along the line', async () => {
    const result = await tool.run({
      point: { longitude: 0.5, latitude: 1 },
      line: [
        [0, 0],
        [1, 0]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // location should be roughly half the line length
    const lineLength = 111; // ~111km for 1 degree at equator
    expect(result.structuredContent?.location).toBeCloseTo(lineLength / 2, -1);
  });

  it('works with a multi-segment line', async () => {
    const result = await tool.run({
      point: { longitude: 1, latitude: 1 },
      line: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.nearest).toBeDefined();
    expect(result.structuredContent?.distance).toBeGreaterThanOrEqual(0);
  });

  it('rejects a line with fewer than two coordinates', async () => {
    const result = await tool.run({
      point: { longitude: 0, latitude: 0 },
      line: [[0, 0]],
      units: 'kilometers'
    });

    expect(result.isError).toBe(true);
  });
});
