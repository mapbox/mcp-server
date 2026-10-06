// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export interface MapAppCsp {
  connectDomains: string[];
  resourceDomains: string[];
  workerDomains: string[];
}

const MAPBOX_API_ORIGIN = 'https://api.mapbox.com';
const MAPBOX_EVENTS_ORIGIN = 'https://events.mapbox.com';

/**
 * The exact origins the map app uses, for its MCP Apps CSP.
 *
 * Hosts compare the declared CSP against what the UI actually loads, and
 * reviewers expect the narrowest list that works, so this names hosts instead
 * of allowing all of `*.mapbox.com`:
 *
 * - GL JS loads its script and stylesheet, and fetches styles, tiles, sprites,
 *   glyphs and 3D models, from api.mapbox.com, and sends telemetry to
 *   events.mapbox.com (see Mapbox GL JS's CSP guide).
 * - The page's own API calls (Directions, Isochrone, Search Box and so on) go to
 *   `apiEndpoint`, which `MAPBOX_API_ENDPOINT` can point somewhere else, so its
 *   origin is added when it differs.
 * - GL JS runs its workers from `blob:` URLs.
 */
export function mapAppCsp(apiEndpoint: string): MapAppCsp {
  const connectDomains = [MAPBOX_API_ORIGIN, MAPBOX_EVENTS_ORIGIN];
  try {
    const apiOrigin = new URL(apiEndpoint).origin;
    if (!connectDomains.includes(apiOrigin)) connectDomains.push(apiOrigin);
  } catch {
    // An endpoint that isn't a valid URL can't be reached by the page anyway.
  }
  return {
    connectDomains,
    resourceDomains: [MAPBOX_API_ORIGIN],
    workerDomains: ['blob:']
  };
}
