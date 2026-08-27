// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  buildInlineImageRef,
  resolveInlineImageRef,
  isInlineImageRef
} from '../../src/utils/inlineImageRef.js';

describe('inlineImageRef', () => {
  it('round-trips request params with no server-side state involved', () => {
    const params = {
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 1280, height: 900 },
      style: 'mapbox/streets-v12'
    };
    const ref = buildInlineImageRef('static-map', params);
    expect(ref).toMatch(/^mapbox:\/\/inline-image\/static-map\?data=/);

    const resolved = resolveInlineImageRef(ref);
    expect(resolved?.tool).toBe('static-map');
    expect(resolved?.params).toEqual(params);
  });

  it('encodes only the (tiny) request params, never the image bytes — the ref stays far under the MCP SDK 1,000,000-char URI cap regardless of how large the eventual image is', () => {
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: -74.006, latitude: 40.7128 },
      zoom: 12,
      size: { width: 1280, height: 1280 },
      style: 'mapbox/streets-v12',
      highDensity: true
    });
    expect(ref.length).toBeLessThan(1000);
  });

  it('is resolvable independently of any prior process state (simulated restart, or a different hosted task)', () => {
    const ref = buildInlineImageRef('static-map', {
      center: { longitude: 0, latitude: 0 },
      zoom: 1,
      size: { width: 100, height: 100 },
      style: 'mapbox/streets-v12'
    });
    const first = resolveInlineImageRef(ref);
    const second = resolveInlineImageRef(ref);
    expect(first).toEqual(second);
  });

  it('returns null for a malformed data param', () => {
    expect(
      resolveInlineImageRef(
        'mapbox://inline-image/static-map?data=not-base64!!'
      )
    ).toBeNull();
  });

  it('returns null when the data param is missing', () => {
    expect(
      resolveInlineImageRef('mapbox://inline-image/static-map')
    ).toBeNull();
  });

  it('returns null for an unrecognized tool', () => {
    const ref = buildInlineImageRef('static-map', {}).replace(
      'static-map',
      'bogus'
    );
    expect(resolveInlineImageRef(ref)).toBeNull();
  });

  it('returns null for a non-inline-image uri', () => {
    expect(resolveInlineImageRef('mapbox://temp/static-map-abc')).toBeNull();
    expect(
      resolveInlineImageRef('mapbox://inline-response/directions?data=abc')
    ).toBeNull();
  });

  it('isInlineImageRef distinguishes inline-image refs from other schemes', () => {
    expect(isInlineImageRef('mapbox://inline-image/static-map?data=abc')).toBe(
      true
    );
    expect(isInlineImageRef('mapbox://temp/static-map-abc')).toBe(false);
    expect(
      isInlineImageRef('mapbox://inline-response/directions?data=abc')
    ).toBe(false);
  });
});
