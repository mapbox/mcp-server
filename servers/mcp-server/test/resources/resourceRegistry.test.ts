// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { getResourceByUri } from '../../src/resources/resourceRegistry.js';

describe('getResourceByUri', () => {
  it.each([
    ['mapbox://categories', 'mapbox://categories'],
    ['mapbox://categories/ja', 'mapbox://categories'],
    ['mapbox://version', 'mapbox://version'],
    ['ui://mapbox/map-app/index.html', 'ui://mapbox/map-app/index.html'],
    ['mapbox://temp/static-map-abc123', 'mapbox://temp/{id}'],
    ['mapbox://temp/map-payload-abc123', 'mapbox://temp/{id}'],
    ['mapbox://response/directions?data=e30', 'mapbox://response/{spec}'],
    ['mapbox://compute/union?data=e30', 'mapbox://compute/{spec}'],
    ['mapbox://inline/payload?data=e30', 'mapbox://inline/{spec}'],
    ['mapbox://place-photo/abc', 'mapbox://place-photo/{id}']
  ])('resolves %s to %s', (uri, expected) => {
    expect(getResourceByUri(uri)?.uri).toBe(expected);
  });

  it.each([
    'mapbox://does-not-exist',
    'mapbox://docs',
    'mapbox://',
    'mapbox://../../../etc/passwd',
    'file:///etc/passwd',
    'http://169.254.169.254/latest/meta-data/',
    'mapbox://temp',
    'mapbox://styles/user/style-id'
  ])('does not resolve %s', (uri) => {
    expect(getResourceByUri(uri)).toBeUndefined();
  });
});
