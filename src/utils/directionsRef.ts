// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  buildDirectionsRequestUrl,
  type DirectionsRequestInput
} from '../tools/directions-tool/buildDirectionsRequestUrl.js';
import { resolveSelfFetchRef } from './selfFetchRef.js';

export interface DirectionsRefRequest {
  /** Directions API URL for the same route, with `geometries=geojson`. */
  url: string;
  /**
   * Which of the returned routes the user picked when the original call
   * offered alternatives; use `routes[selectedRouteIndex ?? 0]`.
   */
  selectedRouteIndex?: number;
}

/**
 * Turns the `structuredContent.mapboxRender.ref` from a `directions_tool`
 * result back into a Directions API request for the full route.
 *
 * The ref is a few hundred bytes and carries only the call's own inputs, so
 * an app can hand it to the model instead of the route and fetch the
 * geometry itself when it needs it (e.g. to draw its own map), the same way
 * `render_map_tool` does. It needs no server-side state, so it resolves in
 * any process. The route is fetched again, so with live traffic it can
 * differ slightly from the original call.
 *
 * Returns null for anything that isn't a valid directions ref.
 */
export function directionsRequestFromRef(
  ref: string,
  options: { accessToken: string; apiEndpoint?: string }
): DirectionsRefRequest | null {
  const selfFetch = resolveSelfFetchRef(ref)?.selfFetch?.[0];
  if (!selfFetch || selfFetch.tool !== 'directions') return null;
  const params = selfFetch.params as Partial<DirectionsRequestInput> & {
    selectedRouteIndex?: number;
  };
  const coords = params.coordinates;
  if (
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !coords.every(
      (c) => typeof c?.longitude === 'number' && typeof c?.latitude === 'number'
    )
  ) {
    return null;
  }

  const url = buildDirectionsRequestUrl({
    input: {
      coordinates: coords,
      routing_profile: params.routing_profile ?? 'mapbox/driving-traffic',
      geometries: 'geojson',
      // geojson now defaults to a simplified overview; whoever draws from
      // this wants every vertex, like the map app's own self-fetch.
      overview: 'full',
      alternatives: params.alternatives === true,
      exclude: params.exclude,
      depart_at: params.depart_at,
      arrive_by: params.arrive_by,
      max_height: params.max_height,
      max_width: params.max_width,
      max_weight: params.max_weight
    },
    accessToken: options.accessToken,
    apiEndpoint:
      options.apiEndpoint ??
      process.env.MAPBOX_API_ENDPOINT ??
      'https://api.mapbox.com/'
  });
  return { url, selectedRouteIndex: params.selectedRouteIndex };
}
