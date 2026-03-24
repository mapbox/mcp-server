// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { IntersectTool } from '../../../src/tools/intersect-tool/IntersectTool.js';

describe('IntersectTool', () => {
  const tool = new IntersectTool();

  it('returns intersection geometry for overlapping polygons', async () => {
    const result = await tool.run({
      polygon1: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0]
        ]
      ],
      polygon2: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.intersects).toBe(true);
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('returns intersects=false for non-overlapping polygons', async () => {
    const result = await tool.run({
      polygon1: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ],
      polygon2: [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.intersects).toBe(false);
    expect(result.structuredContent?.geometry).toBeNull();
  });

  it('returns intersection for one polygon fully inside another', async () => {
    const result = await tool.run({
      polygon1: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0]
        ]
      ], // large
      polygon2: [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1]
        ]
      ] // small, fully inside
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.intersects).toBe(true);
    // Intersection should equal the smaller polygon
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('respects holes when computing intersection', async () => {
    // polygon1: [0,0]→[4,4] with a hole at [1,1]→[3,3]
    const polygonWithHole = [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0]
      ],
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1]
      ]
    ];
    // polygon2: covers the hole area [1,1]→[3,3]
    const smallSquare = [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1]
      ]
    ];

    const result = await tool.run({
      polygon1: polygonWithHole,
      polygon2: smallSquare
    });

    expect(result.isError).toBe(false);
    // The hole excludes that area from polygon1, so no shared area
    expect(result.structuredContent?.intersects).toBe(false);
  });

  it('text content describes intersection result', async () => {
    const overlapping = await tool.run({
      polygon1: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0]
        ]
      ],
      polygon2: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1]
        ]
      ]
    });
    expect((overlapping.content[0] as { text: string }).text).toContain(
      'intersect'
    );

    const nonOverlapping = await tool.run({
      polygon1: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ],
      polygon2: [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5]
        ]
      ]
    });
    expect((nonOverlapping.content[0] as { text: string }).text).toContain(
      'do not intersect'
    );
  });
});
