// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface ReverseGeocodeRequestInput {
  longitude: number;
  latitude: number;
  types: string;
  language?: string;
}

/**
 * Build the Mapbox Geocoding v6 reverse request URL for a given input.
 * Shared by GroundLocationTool.execute() (server-side) and hand-mirrored
 * by the self-fetching map preview iframe (mapAppHtml.ts) — the parity
 * test in test/resources/ui-apps/groundLocationSelfFetchUrlParity.test.ts
 * keeps the two implementations in sync.
 */
export function buildReverseGeocodeUrl(params: {
  input: ReverseGeocodeRequestInput;
  accessToken: string;
  apiEndpoint: string;
}): string {
  const { input, accessToken, apiEndpoint } = params;

  const url = new URL(`${apiEndpoint}search/geocode/v6/reverse`);
  url.searchParams.append('longitude', input.longitude.toString());
  url.searchParams.append('latitude', input.latitude.toString());
  url.searchParams.append('access_token', accessToken);
  url.searchParams.append('limit', '1');
  url.searchParams.append('types', input.types);
  if (input.language) {
    url.searchParams.append('language', input.language);
  }

  return url.toString();
}
