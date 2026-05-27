// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  UnionAppTool,
  IntersectAppTool,
  DifferenceAppTool
} from '../../../src/tools/polygon-ops-app-tool/PolygonOpsAppTool.js';

// Two overlapping 1°×1° squares.
const polygonA = [
  [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0]
  ]
];
const polygonB = [
  [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
    [1, 1]
  ]
];

const SHARED_URI = 'ui://mapbox/polygon-ops-app/index.html';

describe('UnionAppTool', () => {
  it('returns the union of two polygons + inputs', async () => {
    const result = await new UnionAppTool().run({
      polygons: [polygonA, polygonB]
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.operation).toBe('union');
    expect(payload.inputs).toHaveLength(2);
    expect(payload.result).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(payload.result.geometry.type);
  });

  it('declares the shared polygon-ops resourceUri', () => {
    expect(new UnionAppTool().meta?.ui?.resourceUri).toBe(SHARED_URI);
  });
});

describe('IntersectAppTool', () => {
  it('returns the intersection of two polygons', async () => {
    const result = await new IntersectAppTool().run({
      polygon1: polygonA,
      polygon2: polygonB
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.operation).toBe('intersect');
    expect(payload.result).not.toBeNull();
  });

  it('returns null result for non-overlapping polygons (still no error)', async () => {
    const far = [
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10]
      ]
    ];
    const result = await new IntersectAppTool().run({
      polygon1: polygonA,
      polygon2: far
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.result).toBeNull();
    const summary = (result.content[0] as { type: 'text'; text: string }).text;
    expect(summary).toContain('no overlapping');
  });

  it('shares the same resourceUri as UnionAppTool', () => {
    expect(new IntersectAppTool().meta?.ui?.resourceUri).toBe(SHARED_URI);
  });
});

describe('DifferenceAppTool', () => {
  it('returns polygon1 minus polygon2', async () => {
    const result = await new DifferenceAppTool().run({
      polygon1: polygonA,
      polygon2: polygonB
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(
      (result.content[1] as { type: 'text'; text: string }).text
    );
    expect(payload.operation).toBe('difference');
    expect(payload.result).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(payload.result.geometry.type);
  });

  it('shares the same resourceUri', () => {
    expect(new DifferenceAppTool().meta?.ui?.resourceUri).toBe(SHARED_URI);
  });
});
