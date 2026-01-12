// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { AreaTool } from '../../../src/tools/area-tool/AreaTool.js';

describe('AreaTool', () => {
  const tool = new AreaTool();

  it('should calculate area of square in square meters (default)', async () => {
    // ~1km x 1km square (at equator)
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('meters');
    // Should be approximately 1,237,000 square meters (varies by latitude)
    expect(result.structuredContent?.area).toBeGreaterThan(1000000);
    expect(result.structuredContent?.area).toBeLessThan(1500000);
  });

  it('should calculate area in square kilometers', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('kilometers');
    // Should be approximately 1.2 square kilometers
    expect(result.structuredContent?.area).toBeGreaterThan(1);
    expect(result.structuredContent?.area).toBeLessThan(1.5);
  });

  it('should calculate area in square feet', async () => {
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
      units: 'feet'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('feet');
    expect(result.structuredContent?.area).toBeGreaterThan(100000);
  });

  it('should calculate area in square miles', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.1, 0],
          [0.1, 0.1],
          [0, 0.1],
          [0, 0]
        ]
      ],
      units: 'miles'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('miles');
    // Should be roughly 47 square miles
    expect(result.structuredContent?.area).toBeGreaterThan(40);
    expect(result.structuredContent?.area).toBeLessThan(50);
  });

  it('should calculate area in acres', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0]
        ]
      ],
      units: 'acres'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('acres');
    // Should be approximately 305 acres
    expect(result.structuredContent?.area).toBeGreaterThan(250);
    expect(result.structuredContent?.area).toBeLessThan(350);
  });

  it('should calculate area in hectares', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0.01],
          [0, 0]
        ]
      ],
      units: 'hectares'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.units).toBe('hectares');
    // Should be approximately 124 hectares
    expect(result.structuredContent?.area).toBeGreaterThan(100);
    expect(result.structuredContent?.area).toBeLessThan(150);
  });

  it('should calculate area of triangle', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.01, 0],
          [0.005, 0.01],
          [0, 0]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Triangle should have roughly half the area of the rectangle
    expect(result.structuredContent?.area).toBeGreaterThan(0.5);
    expect(result.structuredContent?.area).toBeLessThan(1);
  });

  it('should calculate area of polygon with hole', async () => {
    const result = await tool.run({
      geometry: [
        // Outer ring - 2km x 2km
        [
          [0, 0],
          [0.02, 0],
          [0.02, 0.02],
          [0, 0.02],
          [0, 0]
        ],
        // Inner ring (hole) - 1km x 1km
        [
          [0.005, 0.005],
          [0.015, 0.005],
          [0.015, 0.015],
          [0.005, 0.015],
          [0.005, 0.005]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Area should be outer minus inner (roughly 4 - 1 = 3 km²)
    expect(result.structuredContent?.area).toBeGreaterThan(2.5);
    expect(result.structuredContent?.area).toBeLessThan(4);
  });

  it('should calculate area of multipolygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          // First polygon - 1km x 1km
          [
            [0, 0],
            [0.01, 0],
            [0.01, 0.01],
            [0, 0.01],
            [0, 0]
          ]
        ],
        [
          // Second polygon - 1km x 1km
          [
            [0.02, 0],
            [0.03, 0],
            [0.03, 0.01],
            [0.02, 0.01],
            [0.02, 0]
          ]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Total area should be roughly 2.4 km²
    expect(result.structuredContent?.area).toBeGreaterThan(2);
    expect(result.structuredContent?.area).toBeLessThan(3);
  });

  it('should calculate area of irregular polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.02, 0],
          [0.025, 0.01],
          [0.02, 0.02],
          [0.01, 0.025],
          [0, 0.02],
          [0, 0]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.area).toBeGreaterThan(3);
    expect(result.structuredContent?.area).toBeLessThan(7);
  });

  it('should round area to 3 decimal places', async () => {
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
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    const area = result.structuredContent?.area as number;
    const decimalPlaces = (area.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });

  it('should handle very small polygons', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [0.0001, 0],
          [0.0001, 0.0001],
          [0, 0.0001],
          [0, 0]
        ]
      ],
      units: 'meters'
    });

    expect(result.isError).toBe(false);
    // Should be roughly 123 square meters
    expect(result.structuredContent?.area).toBeGreaterThan(100);
    expect(result.structuredContent?.area).toBeLessThan(200);
  });

  it('should handle large polygons', async () => {
    // Approximate area of a US state-sized polygon
    const result = await tool.run({
      geometry: [
        [
          [-120, 35],
          [-110, 35],
          [-110, 42],
          [-120, 42],
          [-120, 35]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Should be hundreds of thousands of square kilometers
    expect(result.structuredContent?.area).toBeGreaterThan(500000);
  });

  it('should calculate area in southern hemisphere', async () => {
    const result = await tool.run({
      geometry: [
        [
          [-60, -30],
          [-50, -30],
          [-50, -20],
          [-60, -20],
          [-60, -30]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.area).toBeGreaterThan(900000);
  });

  it('should handle polygon near poles', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 85],
          [10, 85],
          [10, 86],
          [0, 86],
          [0, 85]
        ]
      ],
      units: 'kilometers'
    });

    expect(result.isError).toBe(false);
    // Area should be much smaller near poles due to convergence of meridians
    expect(result.structuredContent?.area).toBeGreaterThan(0);
    expect(result.structuredContent?.area).toBeLessThan(20000);
  });

  it('should calculate zero area for degenerate polygon (line)', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [0, 0]
        ]
      ],
      units: 'kilometers'
    });

    // Degenerate polygon may error or return 0 area
    if (result.isError) {
      expect(result.isError).toBe(true);
    } else {
      expect(result.structuredContent?.area).toBe(0);
    }
  });
});
