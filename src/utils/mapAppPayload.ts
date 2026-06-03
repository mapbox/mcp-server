// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Payload format for the generic Mapbox MCP App (`ui://mapbox/map-app/...`).
 *
 * Tools that want to render their result on a live Mapbox GL JS map produce
 * a `MapAppPayload` and attach it to the tool result at `_meta.ui.payload`.
 * The shared iframe template reads it and translates each entry into
 * `map.addSource`/`map.addLayer`/`new mapboxgl.Marker` calls.
 *
 * The payload is intentionally a thin pass-through to Mapbox Style spec
 * `paint` and `layout` objects rather than its own DSL — the iframe just
 * forwards them to GL JS. That keeps the spec surface small and avoids
 * reinventing a chunk of the style spec over postMessage.
 */

export type Geometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };

export type Feature = {
  type: 'Feature';
  geometry: Geometry;
  properties?: Record<string, unknown>;
};

export type FeatureCollection = {
  type: 'FeatureCollection';
  features: Feature[];
};

export interface MapAppLayer {
  /** Unique within the payload — used as both source id and layer id. */
  id: string;
  type: 'fill' | 'line' | 'circle' | 'symbol';
  data: Feature | FeatureCollection;
  /** Mapbox Style spec paint object, passed through to addLayer. */
  paint?: Record<string, unknown>;
  /** Mapbox Style spec layout object, passed through to addLayer. */
  layout?: Record<string, unknown>;
}

export interface MapAppMarker {
  coordinates: [number, number];
  /**
   * Visual style:
   *   - `pin`: default Mapbox marker
   *   - `numbered`: circular badge containing `label` (e.g. visit order)
   *   - `start`/`end`: green/red circular badge (route endpoints)
   */
  style?: 'pin' | 'numbered' | 'start' | 'end';
  /** Required when style === 'numbered'. */
  label?: string;
  /** Optional CSS color override; defaults are style-derived. */
  color?: string;
  /** Popup text (optional). */
  popup?: string;
}

export interface MapAppLegendEntry {
  label: string;
  color: string;
  opacity?: number;
}

export interface MapAppCamera {
  center?: [number, number];
  zoom?: number;
  /** If set, takes precedence over center/zoom and over auto-fit. */
  bounds?: [[number, number], [number, number]];
}

/**
 * For responses >50KB where the geometry is offloaded to a temp resource:
 * the iframe will fetch this URI via `resources/read` (host bridge) and
 * merge the returned GeoJSON into the named layer.
 */
export interface MapAppDeferredLayer {
  resourceUri: string;
  layerId: string;
}

export interface MapAppPayload {
  /** Short header chip shown in the top-left of the iframe. */
  summary?: string;
  /** Layers to add to the map (in order). */
  layers: MapAppLayer[];
  markers?: MapAppMarker[];
  /** Bottom-left legend rows (color swatch + label). */
  legend?: MapAppLegendEntry[];
  /** Optional initial camera; otherwise auto-fits to the union of all data. */
  camera?: MapAppCamera;
  /** Optional fetch-on-render hook for large geometries. */
  defer?: MapAppDeferredLayer;
}

/**
 * Decode a Mapbox polyline string (precision 5 by default) to a GeoJSON
 * LineString. Used tool-side so the iframe never has to do this — the
 * generic renderer only ever sees GeoJSON.
 *
 * Returns null if the decoded coordinates fall outside lng/lat bounds,
 * which can happen if the precision is wrong (the Directions API can emit
 * polyline6 when `geometries=polyline6`). Callers should try precision 6
 * as a fallback.
 */
export function decodePolyline(
  str: string,
  precision = 5
): [number, number][] | null {
  if (!str || typeof str !== 'string') return null;
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < str.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < str.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < str.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    const lngOut = lng / factor;
    const latOut = lat / factor;
    if (lngOut < -180 || lngOut > 180 || latOut < -90 || latOut > 90) {
      return null;
    }
    coords.push([lngOut, latOut]);
  }
  return coords;
}

/**
 * Convenience: decode polyline with precision-5 then precision-6 fallback.
 * If both produce out-of-range coordinates, returns null and the caller
 * should skip emitting a map-app payload (the geometry can't be drawn).
 */
export function decodePolylineWithFallback(
  str: string
): [number, number][] | null {
  return decodePolyline(str, 5) ?? decodePolyline(str, 6);
}
