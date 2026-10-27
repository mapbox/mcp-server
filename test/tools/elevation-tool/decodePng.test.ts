// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { decodePng } from '../../../src/tools/elevation-tool/decodePng.js';
import { encodePng } from './pngFixtures.js';

function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = s & 0xff;
  }
  return out;
}

describe('decodePng', () => {
  it.each([
    [4 as const, 'RGBA'],
    [3 as const, 'RGB']
  ])('undoes every row filter (%s channels, %s)', (channels) => {
    const pixels = noise(9 * 10 * channels, channels);
    const png = encodePng(9, 10, channels, pixels, {
      filters: [0, 1, 2, 3, 4]
    });
    const decoded = decodePng(png);
    expect(decoded).toMatchObject({ width: 9, height: 10, channels });
    expect(Buffer.from(decoded.pixels)).toEqual(Buffer.from(pixels));
  });

  it('rejects data that is not a PNG', () => {
    expect(() => decodePng(Buffer.from('<html>challenge</html>'))).toThrow(
      'Not a PNG'
    );
  });

  it('rejects 16-bit and palette images', () => {
    const pixels = new Uint8Array(2 * 2 * 3);
    expect(() =>
      decodePng(encodePng(2, 2, 3, pixels, { bitDepth: 16 }))
    ).toThrow('Unsupported PNG');
    expect(() =>
      decodePng(encodePng(2, 2, 3, pixels, { colorType: 3 }))
    ).toThrow('Unsupported PNG');
  });

  it('rejects a truncated image', () => {
    const png = encodePng(4, 4, 4, noise(64, 7));
    expect(() => decodePng(png.subarray(0, png.length - 20))).toThrow();
  });
});
