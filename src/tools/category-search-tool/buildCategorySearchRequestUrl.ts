// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface CategorySearchRequestInput {
  category: string;
  language?: string;
  limit?: number;
  proximity?: { longitude: number; latitude: number };
  bbox?: {
    minLongitude: number;
    minLatitude: number;
    maxLongitude: number;
    maxLatitude: number;
  };
  country?: string[];
  poi_category_exclusions?: string[];
}

/**
 * Build the Mapbox Search Box "category" request URL for a given input.
 * Shared by CategorySearchTool.execute() (server-side) and hand-mirrored
 * by the self-fetching map preview iframe (mapAppHtml.ts) — the parity
 * test in test/resources/ui-apps/categorySearchSelfFetchUrlParity.test.ts
 * keeps the two implementations in sync.
 */
export function buildCategorySearchRequestUrl(params: {
  input: CategorySearchRequestInput;
  accessToken: string;
  apiEndpoint: string;
}): string {
  const { input, accessToken, apiEndpoint } = params;

  const url = new URL(
    `${apiEndpoint}search/searchbox/v1/category/${encodeURIComponent(input.category)}`
  );
  url.searchParams.append('access_token', accessToken);
  if (input.language) {
    url.searchParams.append('language', input.language);
  }
  if (input.limit !== undefined) {
    url.searchParams.append('limit', input.limit.toString());
  }
  if (input.proximity) {
    url.searchParams.append(
      'proximity',
      `${input.proximity.longitude},${input.proximity.latitude}`
    );
  }
  if (input.bbox) {
    const { minLongitude, minLatitude, maxLongitude, maxLatitude } = input.bbox;
    url.searchParams.append(
      'bbox',
      `${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`
    );
  }
  if (input.country && input.country.length > 0) {
    url.searchParams.append('country', input.country.join(','));
  }
  if (
    input.poi_category_exclusions &&
    input.poi_category_exclusions.length > 0
  ) {
    url.searchParams.append(
      'poi_category_exclusions',
      input.poi_category_exclusions.join(',')
    );
  }

  return url.toString();
}
