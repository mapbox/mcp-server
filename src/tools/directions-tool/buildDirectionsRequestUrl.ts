// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { formatIsoDateTime } from '../../utils/dateUtils.js';

export interface DirectionsRequestInput {
  coordinates: { longitude: number; latitude: number }[];
  routing_profile: string;
  geometries: 'none' | 'geojson';
  overview?: 'full' | 'simplified';
  alternatives: boolean;
  exclude?: string;
  depart_at?: string;
  arrive_by?: string;
  max_height?: number;
  max_width?: number;
  max_weight?: number;
}

/**
 * Build the Mapbox Directions v5 request URL for a given input. Shared by
 * DirectionsTool.execute() (server-side) and hand-mirrored by the
 * self-fetching map preview iframe (mapAppHtml.ts) — the parity test in
 * test/resources/ui-apps/directionsSelfFetchUrlParity.test.ts keeps the two
 * implementations in sync.
 */
export function buildDirectionsRequestUrl(params: {
  input: DirectionsRequestInput;
  accessToken: string;
  apiEndpoint: string;
  geometriesOverride?: 'none' | 'geojson';
}): string {
  const { input, accessToken, apiEndpoint, geometriesOverride } = params;
  const geometries = geometriesOverride ?? input.geometries;
  // Deliberately keyed off input.geometries, not the possibly-overridden
  // `geometries` above: geometriesOverride only exists so the self-fetch
  // parity test can simulate the client's "always fetch geojson itself"
  // behavior against this same function, and that self-fetch path always
  // wants 'full' (see mapAppHtml.ts) regardless of what the original call
  // requested. A real DirectionsTool call never sets geometriesOverride, so
  // this only matters for that test.
  const overview =
    input.overview ?? (input.geometries === 'geojson' ? 'simplified' : 'full');

  const joined = input.coordinates
    .map(({ longitude, latitude }) => `${longitude},${latitude}`)
    .join(';');
  const encodedCoords = encodeURIComponent(joined);

  const queryParams = new URLSearchParams();
  queryParams.append('access_token', accessToken);
  if (geometries !== 'none') {
    queryParams.append('geometries', geometries);
  }
  queryParams.append('alternatives', input.alternatives.toString());

  if (input.routing_profile === 'mapbox/driving-traffic') {
    // The Directions API rejects `congestion` unless overview=full
    // (confirmed live: 422 "Overview option must be full for congestion") —
    // distance/speed have no such restriction and stay accurate at any
    // overview level, since per-segment annotations aren't affected by how
    // much the returned geometry itself is simplified.
    queryParams.append(
      'annotations',
      overview === 'full' ? 'distance,congestion,speed' : 'distance,speed'
    );
  } else {
    queryParams.append('annotations', 'distance,speed');
  }
  queryParams.append('overview', overview);

  if (input.depart_at) {
    queryParams.append('depart_at', formatIsoDateTime(input.depart_at));
  } else if (input.arrive_by) {
    queryParams.append('arrive_by', formatIsoDateTime(input.arrive_by));
  }

  if (input.max_height !== undefined) {
    queryParams.append('max_height', input.max_height.toString());
  }
  if (input.max_width !== undefined) {
    queryParams.append('max_width', input.max_width.toString());
  }
  if (input.max_weight !== undefined) {
    queryParams.append('max_weight', input.max_weight.toString());
  }

  queryParams.append('steps', 'true');
  if (input.exclude) {
    queryParams.append('exclude', input.exclude);
  }

  return `${apiEndpoint}directions/v5/${input.routing_profile}/${encodedCoords}?${queryParams.toString()}`;
}
