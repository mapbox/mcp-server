// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { formatIsoDateTime } from '../../utils/dateUtils.js';

export interface DirectionsRequestInput {
  coordinates: { longitude: number; latitude: number }[];
  routing_profile: string;
  geometries: 'none' | 'geojson';
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
    queryParams.append('annotations', 'distance,congestion,speed');
  } else {
    queryParams.append('annotations', 'distance,speed');
  }
  queryParams.append('overview', 'full');

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
