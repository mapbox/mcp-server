// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  buildSelfFetchRef,
  resolveSelfFetchRef,
  isSelfFetchRef
} from '../../src/utils/selfFetchRef.js';

describe('selfFetchRef', () => {
  it('round-trips a directions ref into a shell payload with no layers of its own', () => {
    const ref = buildSelfFetchRef('directions', {
      coordinates: [
        { longitude: -77, latitude: 38 },
        { longitude: -76, latitude: 39 }
      ],
      routing_profile: 'mapbox/driving-traffic',
      alternatives: false
    });
    expect(ref).toMatch(/^mapbox:\/\/selffetch\/directions\?data=/);

    // No server-side state involved — resolving is a pure function of the
    // ref itself, which is exactly what makes it survive a server restart.
    const payload = resolveSelfFetchRef(ref);
    expect(payload).toEqual({
      layers: [],
      selfFetch: [
        {
          tool: 'directions',
          params: {
            coordinates: [
              { longitude: -77, latitude: 38 },
              { longitude: -76, latitude: 39 }
            ],
            routing_profile: 'mapbox/driving-traffic',
            alternatives: false
          }
        }
      ]
    });
  });

  it('is resolvable independently of any prior process state (simulated restart)', () => {
    const ref = buildSelfFetchRef('directions', {
      coordinates: [
        { longitude: -77, latitude: 38 },
        { longitude: -76, latitude: 39 }
      ]
    });
    const first = resolveSelfFetchRef(ref);
    const second = resolveSelfFetchRef(ref);
    expect(first).toEqual(second);
  });

  it('returns null for a malformed data param', () => {
    expect(
      resolveSelfFetchRef('mapbox://selffetch/directions?data=not-base64!!')
    ).toBeNull();
  });

  it('returns null for an unrecognized tool', () => {
    const ref = buildSelfFetchRef('directions', { coordinates: [] }).replace(
      'directions',
      'bogus'
    );
    expect(resolveSelfFetchRef(ref)).toBeNull();
  });

  it('returns null for a non-self-fetch uri', () => {
    expect(resolveSelfFetchRef('mapbox://temp/map-payload-abc')).toBeNull();
    expect(resolveSelfFetchRef('mapbox://compute/union?data=abc')).toBeNull();
  });

  it('isSelfFetchRef distinguishes self-fetch refs from other schemes', () => {
    expect(isSelfFetchRef('mapbox://selffetch/directions?data=abc')).toBe(true);
    expect(isSelfFetchRef('mapbox://temp/map-payload-abc')).toBe(false);
    expect(isSelfFetchRef('mapbox://compute/union?data=abc')).toBe(false);
  });
});
