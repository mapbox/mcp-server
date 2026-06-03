// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from '../../utils/mapAppPayload.js';

/**
 * Build a `MapAppPayload` for search-style responses (search_and_geocode_tool,
 * category_search_tool). Each result becomes a pin marker; the LLM-facing
 * summary echoes the result count.
 *
 * Returns null if the response has no point-typed features to plot.
 */
export function buildSearchMapPayload(params: {
  data: unknown;
  query?: string;
  proximity?: { longitude: number; latitude: number };
}): MapAppPayload | null {
  const { data, query, proximity } = params;
  const fc = data as
    | {
        type?: string;
        features?: Array<{
          geometry?: { type?: string; coordinates?: [number, number] };
          properties?: {
            name?: string;
            full_address?: string;
            place_formatted?: string;
            distance?: number;
          };
        }>;
      }
    | null
    | undefined;
  if (!fc || !Array.isArray(fc.features)) return null;

  const points = fc.features.filter(
    (f) =>
      f.geometry?.type === 'Point' &&
      Array.isArray(f.geometry.coordinates) &&
      typeof f.geometry.coordinates[0] === 'number' &&
      typeof f.geometry.coordinates[1] === 'number'
  );
  if (points.length === 0 && !proximity) return null;

  const markers: MapAppPayload['markers'] = [];

  if (proximity) {
    markers.push({
      coordinates: [proximity.longitude, proximity.latitude],
      style: 'pin',
      color: '#0f172a',
      popup: 'Search center'
    });
  }

  points.forEach((f, i) => {
    const props = f.properties ?? {};
    const popupParts = [`${i + 1}. ${props.name ?? 'Result'}`];
    const addr = props.full_address ?? props.place_formatted;
    if (addr) popupParts.push(addr);
    if (typeof props.distance === 'number') {
      popupParts.push(`${Math.round(props.distance)} m`);
    }
    markers.push({
      coordinates: f.geometry!.coordinates as [number, number],
      style: 'numbered',
      label: String(i + 1),
      color: '#f97316',
      popup: popupParts.join(' — ')
    });
  });

  const summary = query
    ? `${points.length} result${points.length !== 1 ? 's' : ''} for "${query}"`
    : `${points.length} result${points.length !== 1 ? 's' : ''}`;

  return { summary, layers: [], markers };
}
