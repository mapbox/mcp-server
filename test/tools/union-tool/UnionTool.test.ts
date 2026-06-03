// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { UnionTool } from '../../../src/tools/union-tool/UnionTool.js';

describe('UnionTool', () => {
  const tool = new UnionTool();

  it('merges two overlapping squares into a single polygon', async () => {
    const result = await tool.run({
      polygons: [
        // [0,0] → [2,2]
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0]
          ]
        ],
        // [1,1] → [3,3] (overlaps)
        [
          [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3],
            [1, 1]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.type).toBe('Polygon');
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('returns MultiPolygon for non-overlapping polygons', async () => {
    const result = await tool.run({
      polygons: [
        // [0,0] → [1,1]
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ],
        // [5,5] → [6,6] (no overlap)
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 6],
            [5, 5]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.type).toBe('MultiPolygon');
  });

  it('merges three polygons', async () => {
    const result = await tool.run({
      polygons: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0]
          ]
        ],
        [
          [
            [1, 0],
            [3, 0],
            [3, 2],
            [1, 2],
            [1, 0]
          ]
        ],
        [
          [
            [2, 0],
            [4, 0],
            [4, 2],
            [2, 2],
            [2, 0]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('handles polygons with holes', async () => {
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
    // polygon2: fills the hole exactly [1,1]→[3,3]
    const fillsHole = [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1]
      ]
    ];

    const result = await tool.run({
      polygons: [polygonWithHole, fillsHole]
    });

    expect(result.isError).toBe(false);
    // Union should fill the hole, resulting in a solid polygon with no holes
    expect(result.structuredContent?.type).toBe('Polygon');
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('rejects fewer than two polygons', async () => {
    const result = await tool.run({
      polygons: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(true);
  });

  it('stores a mapboxRender payload with input fills + result fill', async () => {
    const result = await tool.run({
      polygons: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0]
          ]
        ],
        [
          [
            [1, 1],
            [3, 1],
            [3, 3],
            [1, 3],
            [1, 1]
          ]
        ]
      ]
    });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { mapboxRender?: { ref?: string } };
    expect(sc.mapboxRender?.ref).toMatch(/^mapbox:\/\/temp\/map-payload-/);

    const { resolveMapPayloadRef } =
      await import('../../../src/utils/storeMapPayload.js');
    const payload = resolveMapPayloadRef(sc.mapboxRender!.ref!);
    // 2 inputs × (fill + line) + result (fill + line) = 6 layers
    expect(payload?.layers).toHaveLength(6);
    expect(payload?.legend?.[1]?.label).toBe('union result');
  });
});
