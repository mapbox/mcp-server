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

  it('resolves an isochrone ref that carries contours', () => {
    const coordinates = { longitude: -122.119931, latitude: 47.683984 };
    expect(
      resolveSelfFetchRef(
        buildSelfFetchRef('isochrone', {
          coordinates,
          contours_minutes: [15]
        })
      )
    ).not.toBeNull();
    expect(
      resolveSelfFetchRef(
        buildSelfFetchRef('isochrone', {
          coordinates,
          contours_meters: [5000]
        })
      )
    ).not.toBeNull();
  });

  // Regression: a hand-written isochrone ref without a usable contours
  // array used to resolve, so render_map_tool reported success while the
  // iframe's Isochrone request failed with "You must supply one of
  // contours_meters or contours_minutes".
  it.each([
    ['no contours', {}],
    ['scalar contours_minutes', { contours_minutes: 15 }],
    ['empty contours_minutes', { contours_minutes: [] }],
    ['wrong key name', { contours: [15] }],
    ['string contours', { contours_minutes: ['15'] }]
  ])('returns null for an isochrone ref with %s', (_label, extra) => {
    const ref = buildSelfFetchRef('isochrone', {
      coordinates: { longitude: -122.119931, latitude: 47.683984 },
      ...extra
    });
    expect(resolveSelfFetchRef(ref)).toBeNull();
  });

  it('returns null for an isochrone ref without coordinates', () => {
    const ref = buildSelfFetchRef('isochrone', { contours_minutes: [15] });
    expect(resolveSelfFetchRef(ref)).toBeNull();
  });

  it('isSelfFetchRef distinguishes self-fetch refs from other schemes', () => {
    expect(isSelfFetchRef('mapbox://selffetch/directions?data=abc')).toBe(true);
    expect(isSelfFetchRef('mapbox://temp/map-payload-abc')).toBe(false);
    expect(isSelfFetchRef('mapbox://compute/union?data=abc')).toBe(false);
  });
});
