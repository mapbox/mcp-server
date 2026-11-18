// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  // The decoder doesn't check CRCs, so a zero one is enough here.
  return Buffer.concat([head, data, Buffer.alloc(4)]);
}

/**
 * Encodes raw 8-bit pixels as a PNG, filtering row `y` with
 * `filters[y % filters.length]` (0 none, 1 sub, 2 up, 3 average, 4 Paeth)
 * so tests cover every filter the decoder undoes.
 */
export function encodePng(
  width: number,
  height: number,
  channels: 3 | 4,
  pixels: Uint8Array,
  options: { filters?: number[]; bitDepth?: number; colorType?: number } = {}
): Buffer {
  const filters = options.filters ?? [0];
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length];
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const cur = pixels[y * stride + i];
      const left = i >= channels ? pixels[y * stride + i - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft =
        y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      raw[y * (stride + 1) + 1 + i] = (cur - predictor) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = options.colorType ?? (channels === 4 ? 6 : 2);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * A 256 px terrain-RGB tile whose height at pixel (x, y) is
 * `height(x, y)` meters, filtered with every PNG filter in turn.
 */
export function terrainTile(height: (x: number, y: number) => number): Buffer {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round((height(x, y) + 10000) * 10);
      const o = (y * size + x) * 4;
      pixels[o] = (v >> 16) & 0xff;
      pixels[o + 1] = (v >> 8) & 0xff;
      pixels[o + 2] = v & 0xff;
      pixels[o + 3] = 255;
    }
  }
  return encodePng(size, size, 4, pixels, { filters: [0, 1, 2, 3, 4] });
}
