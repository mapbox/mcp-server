// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { ComputeResource } from '../../../src/resources/compute/ComputeResource.js';
import { buildComputeRef } from '../../../src/utils/computeRef.js';

describe('ComputeResource', () => {
  it('resolves a union compute ref via the real resources/read path with zero prior server-side state', async () => {
    const resource = new ComputeResource();
    const ref = buildComputeRef('union', [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
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
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
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
      }
    ]);

    // No temporaryResourceManager involved at all — reads directly from
    // the ref, unlike TemporaryDataResource. Nothing to have been evicted
    // or lost by a server restart.
    const result = await resource.read(ref);

    expect(result.contents[0].mimeType).toBe('application/json');
    const payload = JSON.parse(result.contents[0].text as string);
    expect(payload.layers).toHaveLength(6);
    expect(payload.summary).toBe('Union of 2 polygons');
  });

  it('is unaffected by other requesters/accounts — no owner check applies', async () => {
    const resource = new ComputeResource();
    const ref = buildComputeRef('intersect', [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
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
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
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
      }
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAccountB = { authInfo: { token: 'irrelevant' } } as any;
    const result = await resource.read(ref, asAccountB);
    const payload = JSON.parse(result.contents[0].text as string);
    expect(payload.summary).toBe('Intersection of two polygons');
  });

  it('returns a text/plain explanation (not a crash) for a malformed compute ref', async () => {
    const resource = new ComputeResource();
    const result = await resource.read('mapbox://compute/union?data=!!!');

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('malformed or unsupported');
  });
});
