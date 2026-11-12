// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { MVT_DECODER_JS } from '../../../src/resources/ui-apps/mvtDecoder.js';

type Decoder = {
  decodeMvt: (bytes: Uint8Array) => {
    layers: Array<{
      name: string;
      version: number;
      extent: number;
      features: Array<{
        id?: number;
        type: number;
        properties: Record<string, unknown>;
        parts: number[][][];
      }>;
    }>;
  };
  mvtLayerToGeoJson: (
    layer: unknown,
    tile: { z: number; x: number; y: number } | null
  ) => Array<{
    id?: number;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
};

function loadDecoder(): Decoder {
  const context = vm.createContext({ DataView, TextDecoder, Uint8Array });
  vm.runInContext(MVT_DECODER_JS, context);
  return context as unknown as Decoder;
}

// --- A minimal protobuf writer for building test tiles ----------------------
function varint(value: number | bigint): number[] {
  // Negative values are written as 64-bit two's complement, as int64 is.
  let n = BigInt.asUintN(64, BigInt(value));
  const out: number[] = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) byte |= 0x80;
    out.push(byte);
  } while (n > 0n);
  return out;
}
const key = (field: number, wireType: number) => varint(field * 8 + wireType);
const vint = (field: number, value: number | bigint) => [
  ...key(field, 0),
  ...varint(value)
];
const bytesField = (field: number, bytes: number[]) => [
  ...key(field, 2),
  ...varint(bytes.length),
  ...bytes
];
const str = (field: number, text: string) =>
  bytesField(field, [...new TextEncoder().encode(text)]);
const packed = (field: number, values: number[]) =>
  bytesField(
    field,
    values.flatMap((v) => varint(v))
  );
function fixed(field: number, wireType: 1 | 5, value: number): number[] {
  const buffer = new DataView(new ArrayBuffer(wireType === 1 ? 8 : 4));
  if (wireType === 1) buffer.setFloat64(0, value, true);
  else buffer.setFloat32(0, value, true);
  return [...key(field, wireType), ...new Uint8Array(buffer.buffer)];
}
const zz = (n: number) => (n << 1) ^ (n >> 31);
const cmd = (id: number, count: number) => (id & 7) | (count << 3);
/** Geometry commands for MoveTo-started rings or lines, in absolute coordinates. */
function path(parts: number[][][], close: boolean): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const part of parts) {
    part.forEach(([px, py], i) => {
      if (i === 0) out.push(cmd(1, 1));
      else if (i === 1) out.push(cmd(2, part.length - 1));
      out.push(zz(px - x), zz(py - y));
      x = px;
      y = py;
    });
    if (close) out.push(cmd(7, 1));
  }
  return out;
}
const feature = (
  id: number | undefined,
  type: number,
  tags: number[],
  geometry: number[]
) => [
  ...(id === undefined ? [] : vint(1, id)),
  ...packed(2, tags),
  ...vint(3, type),
  ...packed(4, geometry)
];

const E = 4096;
const outer = [
  [0, 0],
  [E, 0],
  [E, E],
  [0, E]
];
const hole = [
  [1024, 1024],
  [1024, 3072],
  [3072, 3072],
  [3072, 1024]
];
const island = [
  [1536, 1536],
  [2560, 1536],
  [2560, 2560],
  [1536, 2560]
];

const layer = [
  ...vint(15, 2),
  ...str(1, 'places'),
  ...vint(5, E),
  ...str(3, 'name'),
  ...str(3, 'rank'),
  ...str(3, 'neg'),
  ...str(3, 'ratio'),
  ...str(3, 'scale'),
  ...str(3, 'open'),
  ...str(3, 'delta'),
  ...bytesField(4, str(1, 'Helsinki')),
  ...bytesField(4, vint(5, 3)),
  ...bytesField(4, vint(4, -1)),
  ...bytesField(4, fixed(3, 1, 0.5)),
  ...bytesField(4, fixed(2, 5, 1.5)),
  ...bytesField(4, vint(7, 1)),
  ...bytesField(4, vint(6, zz(-2))),
  ...bytesField(
    2,
    feature(7, 1, [0, 0, 1, 1, 2, 2], path([[[E / 2, E / 2]]], false))
  ),
  ...bytesField(
    2,
    feature(
      undefined,
      2,
      [3, 3, 4, 4, 5, 5, 6, 6],
      path(
        [
          [
            [0, 0],
            [E, 0],
            [E, E]
          ]
        ],
        false
      )
    )
  ),
  ...bytesField(2, feature(9, 3, [], path([outer, hole, island], true)))
];
const tile = Uint8Array.from([...vint(99, 1), ...bytesField(3, layer)]);

describe('MVT decoder', () => {
  it('decodes layers, values of every type and geometry', () => {
    const { layers } = loadDecoder().decodeMvt(tile);
    expect(layers).toHaveLength(1);
    const [places] = layers;
    expect(places).toMatchObject({ name: 'places', version: 2, extent: E });
    expect(places.features.map((f) => [f.id, f.type])).toEqual([
      [7, 1],
      [undefined, 2],
      [9, 3]
    ]);
    expect(places.features[0].properties).toEqual({
      name: 'Helsinki',
      rank: 3,
      neg: -1
    });
    expect(places.features[1].properties).toEqual({
      ratio: 0.5,
      scale: 1.5,
      open: true,
      delta: -2
    });
    expect(places.features[0].parts).toEqual([[[E / 2, E / 2]]]);
    // ClosePath repeats the first point.
    expect(places.features[2].parts[0]).toEqual([...outer, [0, 0]]);
  });

  it('converts to GeoJSON at the tile address', () => {
    const decoder = loadDecoder();
    const [places] = decoder.decodeMvt(tile).layers;
    const [point, line, polygon] = decoder.mvtLayerToGeoJson(places, {
      z: 1,
      x: 1,
      y: 0
    });
    // The center of tile 1/1/0 is at 90°E on the Mercator latitude of y = 0.25.
    expect(point.geometry).toEqual({
      type: 'Point',
      coordinates: [90, 66.5132604]
    });
    expect(point.id).toBe(7);
    expect(line.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [0, 85.0511288],
        [180, 85.0511288],
        [180, 0]
      ]
    });
    // A ring wound against the first is a hole; one wound like it is a new polygon.
    expect(polygon.geometry.type).toBe('MultiPolygon');
    const polygons = polygon.geometry.coordinates as number[][][][];
    expect(polygons.map((rings) => rings.length)).toEqual([2, 1]);
  });

  it('places a tile with no address as 0/0/0', () => {
    const decoder = loadDecoder();
    const [places] = decoder.decodeMvt(tile).layers;
    const [point] = decoder.mvtLayerToGeoJson(places, null);
    expect(point.geometry.coordinates).toEqual([0, 0]);
  });

  it('rejects bytes that are not a vector tile', () => {
    const { decodeMvt } = loadDecoder();
    expect(() => decodeMvt(tile.subarray(0, tile.length - 3))).toThrow();
    expect(() =>
      decodeMvt(new TextEncoder().encode('{"type":"FeatureCollection"}'))
    ).toThrow();
  });
});
