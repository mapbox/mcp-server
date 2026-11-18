// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { union, intersect, difference, featureCollection } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { buildPolygonOpsMapPayload } from '../tools/union-tool/buildPolygonOpsMapPayload.js';
import type { MapAppPayload } from './mapAppPayload.js';

export type PolygonOperation = 'union' | 'intersect' | 'difference';

const COMPUTE_URI_PREFIX = 'mapbox://compute/';

type ComputeFeature = { type: 'Feature'; geometry: unknown };
type PolygonFeature = Feature<Polygon | MultiPolygon>;

/**
 * Stateless alternative to `storeMapPayload` for the offline polygon-op
 * tools (union/intersect/difference). Those tools compute their result from
 * `@turf/turf` given only the caller's own input polygons — there is no
 * external API response to cache and no reason a ref should depend on
 * server-side state at all.
 *
 * Instead of storing the *computed result* behind an opaque UUID (which is
 * lost on every process restart — see the mapbox://temp/ 30-min-TTL-in-
 * memory-store issue this was built to avoid), the ref itself carries the
 * *inputs* (already present in the tool's own call arguments, so no bigger
 * than what the LLM already emitted to call union/intersect/difference in
 * the first place). `resolveComputeRef` re-derives the result by re-running
 * the same turf operation. This makes the ref:
 *  - immune to server restarts (nothing to lose — it's a pure function of
 *    the URI's own contents),
 *  - safe under horizontal scaling (any instance can resolve any ref; no
 *    server affinity, unlike an in-memory store keyed by process),
 *  - safe across accounts (no owner check needed — the ref only ever
 *    contains geometry the caller already had).
 */
export function buildComputeRef(
  operation: PolygonOperation,
  inputs: ComputeFeature[]
): string {
  const data = Buffer.from(JSON.stringify(inputs), 'utf8').toString(
    'base64url'
  );
  return `${COMPUTE_URI_PREFIX}${operation}?data=${data}`;
}

/**
 * Re-derive the `MapAppPayload` for a `mapbox://compute/...` ref by
 * re-running the encoded turf operation. Returns null if the ref isn't a
 * compute ref, the operation is unrecognized, or the encoded data doesn't
 * decode to a valid input array.
 */
export function resolveComputeRef(uri: string): MapAppPayload | null {
  if (!uri.startsWith(COMPUTE_URI_PREFIX)) return null;

  let operation: string;
  let encoded: string | null;
  try {
    const parsed = new URL(uri);
    // The operation is the path segment, not the hostname: for
    // `mapbox://compute/union?...` the WHATWG URL parser treats `compute`
    // as the hostname and `/union` as the pathname.
    operation = parsed.pathname.replace(/^\//, '');
    encoded = parsed.searchParams.get('data');
  } catch {
    return null;
  }
  if (!encoded) return null;

  let inputs: ComputeFeature[];
  try {
    inputs = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(inputs) || inputs.length === 0) return null;

  // `inputs` came from base64-decoded JSON built by buildComputeRef, which
  // only ever writes `{ type: 'Feature', geometry }` (no `properties`) —
  // turf doesn't require it at runtime, so cast past the stricter
  // `Feature<Polygon | MultiPolygon>` shape rather than adding a field
  // nothing reads.
  const fc = featureCollection(inputs as unknown as PolygonFeature[]);

  switch (operation as PolygonOperation) {
    case 'union': {
      const result = union(fc);
      if (!result) return null;
      return buildPolygonOpsMapPayload({
        operation: 'union',
        inputs,
        result,
        summary: `Union of ${inputs.length} polygons`
      });
    }
    case 'intersect': {
      const result = intersect(fc);
      return buildPolygonOpsMapPayload({
        operation: 'intersect',
        inputs,
        result: result ?? null,
        summary: result
          ? 'Intersection of two polygons'
          : 'Polygons do not intersect'
      });
    }
    case 'difference': {
      const result = difference(fc);
      return buildPolygonOpsMapPayload({
        operation: 'difference',
        inputs,
        result: result ?? null,
        summary: result
          ? 'Difference of two polygons (polygon1 minus polygon2)'
          : 'polygon2 fully covers polygon1 (no difference)'
      });
    }
    default:
      return null;
  }
}

export function isComputeRef(uri: string): boolean {
  return uri.startsWith(COMPUTE_URI_PREFIX);
}
