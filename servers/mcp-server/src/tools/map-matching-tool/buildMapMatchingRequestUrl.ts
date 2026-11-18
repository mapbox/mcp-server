// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface MapMatchingRequestInput {
  coordinates: { longitude: number; latitude: number }[];
  profile: string;
  timestamps?: number[];
  radiuses?: number[];
  annotations?: string[];
  overview: string;
  geometries: string;
}

/**
 * Build the Mapbox Map Matching v5 request URL for a given input. Shared by
 * MapMatchingTool.execute() (server-side) and hand-mirrored by the
 * self-fetching map preview iframe (mapAppHtml.ts) — the parity test in
 * test/resources/ui-apps/mapMatchingSelfFetchUrlParity.test.ts keeps the
 * two implementations in sync.
 */
export function buildMapMatchingRequestUrl(params: {
  input: MapMatchingRequestInput;
  accessToken: string;
  apiEndpoint: string;
}): string {
  const { input, accessToken, apiEndpoint } = params;

  const coordsString = input.coordinates
    .map((c) => `${c.longitude},${c.latitude}`)
    .join(';');

  const queryParams = new URLSearchParams();
  queryParams.append('access_token', accessToken);
  queryParams.append('geometries', input.geometries);
  queryParams.append('overview', input.overview);
  if (input.timestamps) {
    queryParams.append('timestamps', input.timestamps.join(';'));
  }
  if (input.radiuses) {
    queryParams.append('radiuses', input.radiuses.join(';'));
  }
  if (input.annotations && input.annotations.length > 0) {
    queryParams.append('annotations', input.annotations.join(','));
  }

  return `${apiEndpoint}matching/v5/mapbox/${input.profile}/${coordsString}?${queryParams.toString()}`;
}
