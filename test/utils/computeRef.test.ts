// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  buildComputeRef,
  resolveComputeRef,
  isComputeRef
} from '../../src/utils/computeRef.js';

const squareA = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0]
      ]
    ]
  }
};
const squareB = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, 1]
      ]
    ]
  }
};
const farAwaySquare = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [50, 50],
        [52, 50],
        [52, 52],
        [50, 52],
        [50, 50]
      ]
    ]
  }
};

describe('computeRef', () => {
  it('round-trips a union of two overlapping polygons with no server-side state', () => {
    const ref = buildComputeRef('union', [squareA, squareB]);
    expect(ref).toMatch(/^mapbox:\/\/compute\/union\?data=/);

    // No store, no setup — resolving is a pure function of the ref itself,
    // which is exactly what makes it survive a server restart.
    const payload = resolveComputeRef(ref);
    expect(payload).not.toBeNull();
    expect(payload?.layers.some((l) => l.id === 'result-fill')).toBe(true);
    expect(payload?.summary).toBe('Union of 2 polygons');
  });

  it('round-trips an intersection of two overlapping polygons', () => {
    const ref = buildComputeRef('intersect', [squareA, squareB]);
    const payload = resolveComputeRef(ref);
    expect(payload?.summary).toBe('Intersection of two polygons');
    expect(payload?.layers.some((l) => l.id === 'result-fill')).toBe(true);
  });

  it('reports no intersection for non-overlapping polygons without erroring', () => {
    const ref = buildComputeRef('intersect', [squareA, farAwaySquare]);
    const payload = resolveComputeRef(ref);
    expect(payload?.summary).toBe('Polygons do not intersect');
    expect(payload?.layers.some((l) => l.id === 'result-fill')).toBe(false);
  });

  it('round-trips a difference of two overlapping polygons', () => {
    const ref = buildComputeRef('difference', [squareA, squareB]);
    const payload = resolveComputeRef(ref);
    expect(payload?.summary).toBe(
      'Difference of two polygons (polygon1 minus polygon2)'
    );
  });

  it('is resolvable independently of any prior process state (simulated restart)', () => {
    // Build the ref in one "process" (this call), then resolve it via a
    // completely fresh call with no shared module state touched in between
    // — unlike storeMapPayload/temporaryResourceManager, there is no Map to
    // have been cleared by a restart.
    const ref = buildComputeRef('union', [squareA, squareB]);
    const first = resolveComputeRef(ref);
    const second = resolveComputeRef(ref);
    expect(first).toEqual(second);
  });

  it('returns null for a malformed data param', () => {
    expect(
      resolveComputeRef('mapbox://compute/union?data=not-valid-base64!!')
    ).toBeNull();
  });

  it('returns null for an unrecognized operation', () => {
    const ref = buildComputeRef('union', [squareA, squareB]).replace(
      'union',
      'bogus'
    );
    expect(resolveComputeRef(ref)).toBeNull();
  });

  it('returns null for a non-compute uri', () => {
    expect(resolveComputeRef('mapbox://temp/map-payload-abc')).toBeNull();
  });

  it('isComputeRef distinguishes compute refs from temp-store refs', () => {
    expect(isComputeRef('mapbox://compute/union?data=abc')).toBe(true);
    expect(isComputeRef('mapbox://temp/map-payload-abc')).toBe(false);
  });
});
