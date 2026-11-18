// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface OptimizationRequestInput {
  coordinates: { longitude: number; latitude: number }[];
  profile: string;
  source?: string;
  destination?: string;
  roundtrip: boolean;
  geometries?: string;
  overview?: string;
  steps?: boolean;
  annotations?: string[];
  language?: string;
}

/**
 * Build the Mapbox Optimization v1 request URL for a given input. Shared
 * by OptimizationTool.execute() (server-side) and hand-mirrored by the
 * self-fetching map preview iframe (mapAppHtml.ts) — the parity test in
 * test/resources/ui-apps/optimizationSelfFetchUrlParity.test.ts keeps the
 * two implementations in sync.
 */
export function buildOptimizationRequestUrl(params: {
  input: OptimizationRequestInput;
  accessToken: string;
  apiEndpoint: string;
  geometriesOverride?: string;
  overviewOverride?: string;
}): string {
  const {
    input,
    accessToken,
    apiEndpoint,
    geometriesOverride,
    overviewOverride
  } = params;

  const coordinatesStr = input.coordinates
    .map((c) => `${c.longitude},${c.latitude}`)
    .join(';');

  const queryParams = new URLSearchParams({ access_token: accessToken });
  if (input.source) {
    queryParams.set('source', input.source);
  }
  if (input.destination) {
    queryParams.set('destination', input.destination);
  }
  queryParams.set('roundtrip', String(input.roundtrip));

  const geometries = geometriesOverride ?? input.geometries;
  if (geometries) {
    queryParams.set('geometries', geometries);
  }
  const overview = overviewOverride ?? input.overview;
  if (overview) {
    queryParams.set('overview', overview);
  }
  if (input.steps !== undefined) {
    queryParams.set('steps', String(input.steps));
  }
  if (input.annotations && input.annotations.length > 0) {
    queryParams.set('annotations', input.annotations.join(','));
  }
  if (input.language) {
    queryParams.set('language', input.language);
  }

  return `${apiEndpoint}optimized-trips/v1/${input.profile}/${coordinatesStr}?${queryParams.toString()}`;
}
