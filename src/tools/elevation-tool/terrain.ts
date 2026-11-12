// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { HttpRequest } from '../../utils/types.js';
import { decodePng } from './decodePng.js';

export const TERRAIN_TILESET = 'mapbox.mapbox-terrain-dem-v1';
export const MAX_ZOOM = 14;
const MIN_ZOOM = 5;
/** Most tiles one call may fetch; the zoom drops until the path fits. */
export const MAX_TILES = 48;
const TILE_FETCH_CONCURRENCY = 8;
const EARTH_RADIUS_M = 6371008.8;
/** Swings smaller than this don't count toward climb or descent. */
export const CLIMB_THRESHOLD_M = 2;

export type LngLat = [number, number];

/** Tile coordinates of a point at `zoom`, with the fraction kept. */
function tileXY(point: LngLat, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point[1]));
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((point[0] + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  };
}

function tileKey(point: LngLat, zoom: number): string {
  const { x, y } = tileXY(point, zoom);
  const n = 2 ** zoom;
  return `${zoom}/${Math.min(n - 1, Math.floor(x))}/${Math.min(n - 1, Math.floor(y))}`;
}

/**
 * The most detailed zoom at which `points` need at most MAX_TILES tiles.
 * Long routes get a coarser zoom so a call stays a few dozen requests.
 */
export function chooseZoom(points: LngLat[]): number {
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom--) {
    const tiles = new Set(points.map((p) => tileKey(p, zoom)));
    if (tiles.size <= MAX_TILES) return zoom;
  }
  return MIN_ZOOM;
}

/** Ground size of one 256 px tile pixel at `zoom` and `latitude`, in meters. */
export function pixelSizeMeters(zoom: number, latitude: number): number {
  return (
    (2 * Math.PI * EARTH_RADIUS_M * Math.cos((latitude * Math.PI) / 180)) /
    (256 * 2 ** zoom)
  );
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface PathSample {
  point: LngLat;
  /** Distance along the path from its start, in meters. */
  distance: number;
}

/**
 * Points every `spacing` meters along a line, plus its last vertex.
 * Straight-line interpolation between vertices is fine at these distances.
 */
export function samplePath(line: LngLat[], spacing: number): PathSample[] {
  const samples: PathSample[] = [{ point: line[0], distance: 0 }];
  let travelled = 0;
  let next = spacing;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const segment = haversineMeters(a, b);
    while (segment > 0 && next <= travelled + segment) {
      const t = (next - travelled) / segment;
      samples.push({
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        distance: next
      });
      next += spacing;
    }
    travelled += segment;
  }
  const last = samples[samples.length - 1];
  if (travelled - last.distance > 0.5) {
    samples.push({ point: line[line.length - 1], distance: travelled });
  }
  return samples;
}

export function pathLength(line: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += haversineMeters(line[i - 1], line[i]);
  }
  return total;
}

interface Tile {
  size: number;
  heights: Float32Array;
}

/** Terrain-RGB: height = -10000 + (R * 65536 + G * 256 + B) * 0.1 meters. */
function decodeTile(bytes: Uint8Array): Tile {
  const png = decodePng(bytes);
  if (png.width !== png.height) throw new Error('Terrain tile is not square');
  const heights = new Float32Array(png.width * png.height);
  for (let i = 0; i < heights.length; i++) {
    const o = i * png.channels;
    heights[i] =
      -10000 +
      (png.pixels[o] * 65536 + png.pixels[o + 1] * 256 + png.pixels[o + 2]) *
        0.1;
  }
  return { size: png.width, heights };
}

/** Bilinear height between the four pixel centers around a point. */
function heightInTile(tile: Tile, fx: number, fy: number): number {
  const max = tile.size - 1;
  const px = Math.max(0, Math.min(max, fx * tile.size - 0.5));
  const py = Math.max(0, Math.min(max, fy * tile.size - 0.5));
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(max, x0 + 1);
  const y1 = Math.min(max, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const h = (x: number, y: number) => tile.heights[y * tile.size + x];
  const top = h(x0, y0) * (1 - tx) + h(x1, y0) * tx;
  const bottom = h(x0, y1) * (1 - tx) + h(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Elevation in meters at each point, read from Mapbox's terrain DEM tiles
 * at `zoom`. Each tile is fetched once per call. Throws if a tile can't be
 * fetched or decoded, with the HTTP status when there is one.
 */
export async function elevationsAt(
  points: LngLat[],
  zoom: number,
  options: {
    httpRequest: HttpRequest;
    accessToken: string;
    apiEndpoint: string;
  }
): Promise<number[]> {
  const keys = [...new Set(points.map((p) => tileKey(p, zoom)))];
  const tiles = new Map<string, Tile>();
  let index = 0;
  const worker = async () => {
    while (index < keys.length) {
      const key = keys[index++];
      const url = new URL(
        `${options.apiEndpoint}v4/${TERRAIN_TILESET}/${key}.pngraw`
      );
      url.searchParams.set('access_token', options.accessToken);
      const response = await options.httpRequest(url.toString());
      if (!response.ok) {
        throw new TerrainTileError(response.status, response.statusText);
      }
      tiles.set(key, decodeTile(new Uint8Array(await response.arrayBuffer())));
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(TILE_FETCH_CONCURRENCY, keys.length) },
      worker
    )
  );

  const n = 2 ** zoom;
  return points.map((p) => {
    const { x, y } = tileXY(p, zoom);
    const tx = Math.min(n - 1, Math.floor(x));
    const ty = Math.min(n - 1, Math.floor(y));
    const tile = tiles.get(`${zoom}/${tx}/${ty}`) as Tile;
    return heightInTile(tile, x - tx, y - ty);
  });
}

export class TerrainTileError extends Error {
  constructor(
    readonly status: number,
    statusText: string
  ) {
    super(`Terrain tile request failed: ${status} ${statusText}`.trim());
  }
}

/**
 * Total climb and descent, ignoring swings under CLIMB_THRESHOLD_M so DEM
 * noise on flat ground doesn't add up to phantom hills.
 */
export function climbAndDescent(heights: number[]): {
  climb: number;
  descent: number;
} {
  let climb = 0;
  let descent = 0;
  let ref = heights[0];
  for (const h of heights) {
    if (h - ref >= CLIMB_THRESHOLD_M) {
      climb += h - ref;
      ref = h;
    } else if (ref - h >= CLIMB_THRESHOLD_M) {
      descent += ref - h;
      ref = h;
    }
  }
  return { climb, descent };
}
