// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { redactToken } from '../../src/utils/redactToken.js';

describe('redactToken', () => {
  const PUBLIC_TOKEN = 'pk.eyJ1IjoiZXhhbXBsZS1hY2NvdW50In0.signaturevalue';
  const SECRET_TOKEN = 'sk.eyJ1IjoidGVzdHVzZXIifQ.signaturevalue';
  const TEMP_TOKEN = 'tk.eyJ1IjoidGVtcC11c2VyXzEifQ.signaturevalue';

  it('keeps the prefix and account name, dropping the signature', () => {
    expect(redactToken(`access_token=${PUBLIC_TOKEN}`)).toBe(
      'access_token=pk.example-account.redacted'
    );
    expect(redactToken(`access_token=${SECRET_TOKEN}`)).toBe(
      'access_token=sk.testuser.redacted'
    );
    expect(redactToken(`access_token=${TEMP_TOKEN}`)).toBe(
      'access_token=tk.temp-user_1.redacted'
    );
  });

  it('never emits the token signature', () => {
    expect(
      redactToken(
        `https://api.mapbox.com/directions/v5/mapbox/driving/0,0;1,1?access_token=${PUBLIC_TOKEN}&geometries=geojson`
      )
    ).toBe(
      'https://api.mapbox.com/directions/v5/mapbox/driving/0,0;1,1?access_token=pk.example-account.redacted&geometries=geojson'
    );
  });

  it('redacts every occurrence in a string', () => {
    expect(
      redactToken(
        `first access_token=${PUBLIC_TOKEN} second access_token=${SECRET_TOKEN}`
      )
    ).toBe(
      'first access_token=pk.example-account.redacted second access_token=sk.testuser.redacted'
    );
  });

  it.each([
    ['an unrecognized prefix', 'zz.eyJ1IjoidGVzdHVzZXIifQ.signaturevalue'],
    ['too few segments', 'pk.eyJ1IjoidGVzdHVzZXIifQ'],
    ['a payload that is not base64 JSON', 'pk.@@@notbase64@@@.signaturevalue'],
    [
      'a payload with no account name',
      'pk.eyJhIjoibm9hY2NvdW50In0.signaturevalue'
    ],
    ['an opaque value', 'some-legacy-opaque-token']
  ])('falls back to *** for %s', (_case, token) => {
    expect(redactToken(`access_token=${token}`)).toBe('access_token=***');
  });

  it('leaves strings without a token untouched', () => {
    expect(
      redactToken('https://api.mapbox.com/isochrone/v1/mapbox/driving')
    ).toBe('https://api.mapbox.com/isochrone/v1/mapbox/driving');
  });
});
