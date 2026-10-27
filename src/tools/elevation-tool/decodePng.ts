// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** Bytes per pixel in `pixels`: 3 (RGB) or 4 (RGBA). */
  channels: 3 | 4;
  /** Unfiltered pixel rows, `width * channels` bytes each. */
  pixels: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Terrain tiles are 512 px at most; anything far bigger isn't one.
const MAX_DIMENSION = 4096;

/**
 * Decodes the PNGs terrain-RGB tiles come in: 8-bit RGB or RGBA, not
 * interlaced. That's all the elevation tool reads, and Node's zlib does the
 * heavy part, so it doesn't need an image library. Throws on anything else,
 * including palette or 16-bit images. Chunk CRCs aren't checked; the tile
 * came over TLS and a corrupt one fails to inflate.
 */
export function decodePng(data: Uint8Array): DecodedPng {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < 8 || PNG_SIGNATURE.some((byte, i) => buf[i] !== byte)) {
    throw new Error('Not a PNG');
  }

  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 4;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buf.length) throw new Error('Truncated PNG');
    if (type === 'IHDR') {
      width = buf.readUInt32BE(start);
      height = buf.readUInt32BE(start + 4);
      const bitDepth = buf[start + 8];
      const colorType = buf[start + 9];
      const interlace = buf[start + 12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('Unsupported PNG: only 8-bit RGB or RGBA');
      }
      if (interlace !== 0) throw new Error('Unsupported PNG: interlaced');
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }
  if (
    width === 0 ||
    height === 0 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    throw new Error('Bad PNG size');
  }

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat), {
    maxOutputLength: (stride + 1) * height
  });
  if (raw.length < (stride + 1) * height) throw new Error('Truncated PNG');

  // Undo each row's filter (PNG spec, section 9). `bpp` is the byte
  // distance to the same channel of the pixel on the left.
  const pixels = new Uint8Array(stride * height);
  const bpp = channels;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? pixels[row + i - bpp] : 0;
      const up = y > 0 ? pixels[prev + i] : 0;
      const upLeft = y > 0 && i >= bpp ? pixels[prev + i - bpp] : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = (left + up) >> 1;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default:
          throw new Error('Bad PNG filter');
      }
      pixels[row + i] = (raw[src + i] + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}
