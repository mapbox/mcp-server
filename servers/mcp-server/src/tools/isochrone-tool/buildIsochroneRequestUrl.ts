// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface IsochroneRequestInput {
  profile: string;
  coordinates: { longitude: number; latitude: number };
  contours_minutes?: number[];
  contours_meters?: number[];
  contours_colors?: string[];
  polygons?: boolean;
  denoise?: number;
  generalize?: number;
  exclude?: string[];
  depart_at?: string;
}

/**
 * Build the Mapbox Isochrone v1 request URL for a given input. Shared by
 * IsochroneTool.execute() (server-side) and hand-mirrored by the
 * self-fetching map preview iframe (mapAppHtml.ts) — the parity test in
 * test/resources/ui-apps/isochroneSelfFetchUrlParity.test.ts keeps the two
 * implementations in sync.
 */
export function buildIsochroneRequestUrl(params: {
  input: IsochroneRequestInput;
  accessToken: string;
  apiEndpoint: string;
}): string {
  const { input, accessToken, apiEndpoint } = params;

  const queryParams = new URLSearchParams();
  queryParams.append('access_token', accessToken);
  if (input.contours_minutes && input.contours_minutes.length > 0) {
    queryParams.append('contours_minutes', input.contours_minutes.join(','));
  }
  if (input.contours_meters && input.contours_meters.length > 0) {
    queryParams.append('contours_meters', input.contours_meters.join(','));
  }
  if (input.contours_colors && input.contours_colors.length > 0) {
    queryParams.append('contours_colors', input.contours_colors.join(','));
  }
  if (input.polygons) {
    queryParams.append('polygons', String(input.polygons));
  }
  if (input.denoise) {
    queryParams.append('denoise', String(input.denoise));
  }
  if (input.generalize) {
    queryParams.append('generalize', String(input.generalize));
  }
  if (input.exclude && input.exclude.length > 0) {
    queryParams.append('exclude', input.exclude.join(','));
  }
  if (input.depart_at) {
    queryParams.append('depart_at', input.depart_at);
  }

  return (
    `${apiEndpoint}isochrone/v1/${input.profile}/` +
    `${input.coordinates.longitude}%2C${input.coordinates.latitude}?${queryParams.toString()}`
  );
}
