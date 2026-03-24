// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { LengthTool } from '../../../src/tools/length-tool/LengthTool.js';

describe('LengthTool', () => {
  const tool = new LengthTool();

  it('measures a straight line in kilometers', async () => {
    const result = await tool.run({
      coordinates: [
        [0, 0],
        [1, 0] // ~111km along the equator
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.length).toBeCloseTo(111, 0);
    expect(result.structuredContent?.units).toBe('kilometers');
    expect(result.structuredContent?.num_coordinates).toBe(2);
  });

  it('defaults to meters', async () => {
    const result = await tool.run({
      coordinates: [
        [0, 0],
        [0.001, 0]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('meters');
    expect(result.structuredContent?.length).toBeGreaterThan(0);
  });

  it('measures in miles', async () => {
    const result = await tool.run({
      coordinates: [
        [-122.4194, 37.7749], // San Francisco
        [-118.2437, 34.0522] // Los Angeles
      ],
      units: 'miles'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.length).toBeCloseTo(347, 0);
    expect(result.structuredContent?.units).toBe('miles');
  });

  it('accumulates length for multi-segment line', async () => {
    const singleHop = await tool.run({
      coordinates: [
        [0, 0],
        [2, 0]
      ],
      units: 'kilometers'
    });

    const twoHops = await tool.run({
      coordinates: [
        [0, 0],
        [1, 0],
        [2, 0]
      ],
      units: 'kilometers'
    });

    // Two-hop path through the same points should equal single hop
    expect(twoHops.structuredContent?.length).toBeCloseTo(
      singleHop.structuredContent?.length as number,
      1
    );
    expect(twoHops.structuredContent?.num_coordinates).toBe(3);
  });

  it('rounds to 3 decimal places', async () => {
    const result = await tool.run({
      coordinates: [
        [0, 0],
        [0.0001, 0.0001]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    const len = result.structuredContent?.length as number;
    const decimals = (len.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(3);
  });

  it('rejects fewer than two coordinates', async () => {
    const result = await tool.run({
      coordinates: [[0, 0]],
      units: 'kilometers'
    });

    expect(result.isError).toBe(true);
  });
});
