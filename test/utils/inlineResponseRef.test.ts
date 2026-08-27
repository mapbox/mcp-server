// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  buildInlineResponseRef,
  resolveInlineResponseRef,
  isInlineResponseRef
} from '../../src/utils/inlineResponseRef.js';

describe('inlineResponseRef', () => {
  it('round-trips a directions response with no server-side state involved', () => {
    const data = {
      routes: [{ distance: 1500, duration: 180 }],
      waypoints: [{ location: [-74.0, 40.7] }]
    };
    const ref = buildInlineResponseRef('directions', data);
    expect(ref).toMatch(/^mapbox:\/\/inline-response\/directions\?data=/);

    const resolved = resolveInlineResponseRef(ref);
    expect(resolved).toEqual(data);
  });

  it('round-trips an isochrone response', () => {
    const data = { type: 'FeatureCollection', features: [] };
    const ref = buildInlineResponseRef('isochrone', data);
    expect(ref).toMatch(/^mapbox:\/\/inline-response\/isochrone\?data=/);

    const resolved = resolveInlineResponseRef(ref);
    expect(resolved).toEqual(data);
  });

  it('is resolvable independently of any prior process state (simulated restart, or a different hosted task)', () => {
    const ref = buildInlineResponseRef('directions', {
      routes: [{ distance: 1 }]
    });
    // Two independent calls, no shared state between them, mirroring two
    // separate processes (e.g. two ECS tasks) each resolving the ref cold.
    const first = resolveInlineResponseRef(ref);
    const second = resolveInlineResponseRef(ref);
    expect(first).toEqual(second);
  });

  it('returns null for a malformed data param', () => {
    expect(
      resolveInlineResponseRef(
        'mapbox://inline-response/directions?data=not-base64!!'
      )
    ).toBeNull();
  });

  it('returns null for an unrecognized tool', () => {
    const ref = buildInlineResponseRef('directions', {}).replace(
      'directions',
      'bogus'
    );
    expect(resolveInlineResponseRef(ref)).toBeNull();
  });

  it('returns null for a non-inline-response uri', () => {
    expect(resolveInlineResponseRef('mapbox://temp/directions-abc')).toBeNull();
    expect(
      resolveInlineResponseRef('mapbox://selffetch/directions?data=abc')
    ).toBeNull();
    expect(
      resolveInlineResponseRef('mapbox://inline/payload?data=abc')
    ).toBeNull();
  });

  it('isInlineResponseRef distinguishes inline-response refs from other schemes', () => {
    expect(
      isInlineResponseRef('mapbox://inline-response/directions?data=abc')
    ).toBe(true);
    expect(isInlineResponseRef('mapbox://temp/directions-abc')).toBe(false);
    expect(isInlineResponseRef('mapbox://inline/payload?data=abc')).toBe(false);
  });
});
