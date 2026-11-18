// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { buildMapMatchingRequestUrl } from '../tools/map-matching-tool/buildMapMatchingRequestUrl.js';
import { resolveSelfFetchRef } from './selfFetchRef.js';

// The profile goes into the URL path, so only map_matching_tool's own
// values are accepted from a ref.
const PROFILES = new Set(['driving', 'driving-traffic', 'walking', 'cycling']);

/**
 * Turns the `structuredContent.mapboxRender.ref` from a `map_matching_tool`
 * result back into a Map Matching API URL for the full matched line
 * (`geometries=geojson`, `overview=full`), the same way
 * `directionsRequestFromRef` does for directions. The response's
 * `matchings` hold the line; a trace with gaps matches in several pieces.
 *
 * Returns null for anything that isn't a valid map matching ref.
 */
export function mapMatchingRequestFromRef(
  ref: string,
  options: { accessToken: string; apiEndpoint?: string }
): string | null {
  const selfFetch = resolveSelfFetchRef(ref)?.selfFetch?.[0];
  if (!selfFetch || selfFetch.tool !== 'map_matching') return null;
  const params = selfFetch.params as {
    coordinates?: Array<{ longitude?: unknown; latitude?: unknown }>;
    profile?: unknown;
    timestamps?: number[];
    radiuses?: number[];
  };
  const coords = params.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !coords.every(
      (c) => typeof c?.longitude === 'number' && typeof c?.latitude === 'number'
    )
  ) {
    return null;
  }
  const profile = params.profile ?? 'driving';
  if (typeof profile !== 'string' || !PROFILES.has(profile)) return null;

  return buildMapMatchingRequestUrl({
    input: {
      coordinates: coords as Array<{ longitude: number; latitude: number }>,
      profile,
      timestamps: params.timestamps,
      radiuses: params.radiuses,
      geometries: 'geojson',
      overview: 'full'
    },
    accessToken: options.accessToken,
    apiEndpoint:
      options.apiEndpoint ??
      process.env.MAPBOX_API_ENDPOINT ??
      'https://api.mapbox.com/'
  });
}
