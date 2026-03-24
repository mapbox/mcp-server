// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { DifferenceTool } from '../../../src/tools/difference-tool/DifferenceTool.js';

describe('DifferenceTool', () => {
  const tool = new DifferenceTool();

  it('returns the part of polygon1 not covered by polygon2', async () => {
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
          [1, 0],
          [2, 0],
          [2, 2],
          [1, 2],
          [1, 0]
        ]
      ] // right half of polygon1
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.has_difference).toBe(true);
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('returns has_difference=false when polygon2 fully covers polygon1', async () => {
    const result = await tool.run({
      polygon1: [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1]
        ]
      ], // small
      polygon2: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0]
        ]
      ] // large, fully covers
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.has_difference).toBe(false);
    expect(result.structuredContent?.geometry).toBeNull();
  });

  it('returns full polygon1 when polygons do not overlap', async () => {
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
    expect(result.structuredContent?.has_difference).toBe(true);
    expect(result.structuredContent?.geometry).not.toBeNull();
  });

  it('text content describes the result', async () => {
    const withDiff = await tool.run({
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
          [1, 0],
          [2, 0],
          [2, 2],
          [1, 2],
          [1, 0]
        ]
      ]
    });
    expect((withDiff.content[0] as { text: string }).text).toContain(
      'Difference computed'
    );

    const noDiff = await tool.run({
      polygon1: [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
          [1, 1]
        ]
      ],
      polygon2: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0]
        ]
      ]
    });
    expect((noDiff.content[0] as { text: string }).text).toContain(
      'fully covers'
    );
  });
});
