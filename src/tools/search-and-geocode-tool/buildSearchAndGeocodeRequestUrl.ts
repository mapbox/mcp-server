// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface SearchAndGeocodeRequestInput {
  q: string;
  language?: string;
  proximity?: { longitude: number; latitude: number };
  bbox?: {
    minLongitude: number;
    minLatitude: number;
    maxLongitude: number;
    maxLatitude: number;
  };
  country?: string[];
  types?: string[];
  poi_category?: string[];
  auto_complete?: boolean;
  eta_type?: string;
  navigation_profile?: string;
  origin?: { longitude: number; latitude: number };
}

/**
 * Build the Mapbox Search Box "forward" request URL for a given input.
 * Shared by SearchAndGeocodeTool.execute() (server-side) and hand-mirrored
 * by the self-fetching map preview iframe (mapAppHtml.ts) — the parity
 * test in test/resources/ui-apps/searchSelfFetchUrlParity.test.ts keeps
 * the two implementations in sync.
 */
export function buildSearchAndGeocodeRequestUrl(params: {
  input: SearchAndGeocodeRequestInput;
  accessToken: string;
  apiEndpoint: string;
}): string {
  const { input, accessToken, apiEndpoint } = params;

  const url = new URL(`${apiEndpoint}search/searchbox/v1/forward`);
  url.searchParams.append('q', input.q);
  url.searchParams.append('access_token', accessToken);
  if (input.language) {
    url.searchParams.append('language', input.language);
  }
  url.searchParams.append('limit', '10');
  if (input.proximity) {
    url.searchParams.append(
      'proximity',
      `${input.proximity.longitude},${input.proximity.latitude}`
    );
  }
  if (input.bbox) {
    url.searchParams.append(
      'bbox',
      `${input.bbox.minLongitude},${input.bbox.minLatitude},${input.bbox.maxLongitude},${input.bbox.maxLatitude}`
    );
  }
  if (input.country && input.country.length > 0) {
    url.searchParams.append('country', input.country.join(','));
  }
  if (input.types && input.types.length > 0) {
    url.searchParams.append('types', input.types.join(','));
  }
  if (input.poi_category && input.poi_category.length > 0) {
    url.searchParams.append('poi_category', input.poi_category.join(','));
  }
  if (input.auto_complete !== undefined) {
    url.searchParams.append('auto_complete', input.auto_complete.toString());
  }
  if (input.eta_type) {
    url.searchParams.append('eta_type', input.eta_type);
  }
  if (input.navigation_profile) {
    url.searchParams.append('navigation_profile', input.navigation_profile);
  }
  if (input.origin) {
    url.searchParams.append(
      'origin',
      `${input.origin.longitude},${input.origin.latitude}`
    );
  }

  return url.toString();
}
