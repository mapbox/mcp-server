// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { AreaTool } from '../../../src/tools/area-tool/AreaTool.js';
import type { AreaOutput } from '../../../src/tools/area-tool/AreaTool.output.schema.js';
import { structuredOf } from '../../utils/resultTestUtils.js';

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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('meters');
    // Should be approximately 1,237,000 square meters (varies by latitude)
    expect(data.area).toBeGreaterThan(1000000);
    expect(data.area).toBeLessThan(1500000);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('kilometers');
    // Should be approximately 1.2 square kilometers
    expect(data.area).toBeGreaterThan(1);
    expect(data.area).toBeLessThan(1.5);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('feet');
    expect(data.area).toBeGreaterThan(100000);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('miles');
    // Should be roughly 47 square miles
    expect(data.area).toBeGreaterThan(40);
    expect(data.area).toBeLessThan(50);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('acres');
    // Should be approximately 305 acres
    expect(data.area).toBeGreaterThan(250);
    expect(data.area).toBeLessThan(350);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.units).toBe('hectares');
    // Should be approximately 124 hectares
    expect(data.area).toBeGreaterThan(100);
    expect(data.area).toBeLessThan(150);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Triangle should have roughly half the area of the rectangle
    expect(data.area).toBeGreaterThan(0.5);
    expect(data.area).toBeLessThan(1);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Area should be outer minus inner (roughly 4 - 1 = 3 km²)
    expect(data.area).toBeGreaterThan(2.5);
    expect(data.area).toBeLessThan(4);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Total area should be roughly 2.4 km²
    expect(data.area).toBeGreaterThan(2);
    expect(data.area).toBeLessThan(3);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.area).toBeGreaterThan(3);
    expect(data.area).toBeLessThan(7);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    const area = data.area as number;
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Should be roughly 123 square meters
    expect(data.area).toBeGreaterThan(100);
    expect(data.area).toBeLessThan(200);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Should be hundreds of thousands of square kilometers
    expect(data.area).toBeGreaterThan(500000);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    expect(data.area).toBeGreaterThan(900000);
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
    const data = structuredOf<AreaOutput>(result);

    expect(result.isError).toBe(false);
    // Area should be much smaller near poles due to convergence of meridians
    expect(data.area).toBeGreaterThan(0);
    expect(data.area).toBeLessThan(20000);
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
    const data = structuredOf<AreaOutput>(result);

    // Degenerate polygon may error or return 0 area
    if (result.isError) {
      expect(result.isError).toBe(true);
    } else {
      expect(data.area).toBe(0);
    }
  });
});
