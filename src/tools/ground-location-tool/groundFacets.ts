// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { HttpRequest } from '../../utils/types.js';
import type { GroundLocationOutput } from './GroundLocationTool.output.schema.js';

export const STREETS_TILESET = 'mapbox.mapbox-streets-v8';
export const TRAFFIC_TILESET = 'mapbox.mapbox-traffic-v1';
/** How far to look for the nearest water. */
export const WATER_RADIUS_M = 500;
/** How far to look for roads with live traffic. */
export const TRAFFIC_RADIUS_M = 100;

/** Live congestion levels in Mapbox Traffic v1, mildest first. */
const CONGESTION = ['low', 'moderate', 'heavy', 'severe'] as const;

type Land = NonNullable<GroundLocationOutput['land']>;
type Water = NonNullable<GroundLocationOutput['water']>;
type Traffic = NonNullable<GroundLocationOutput['traffic']>;

interface TilequeryFeature {
  properties?: {
    tilequery?: { distance?: number; layer?: string };
    class?: string;
    type?: string;
    name?: string;
    height?: number;
    underground?: string;
    congestion?: string;
  };
}

interface FacetOptions {
  httpRequest: HttpRequest;
  accessToken: string;
  apiEndpoint: string;
}

/**
 * Tilequery features at or near the point, or undefined if the request
 * fails, throws or returns a body that isn't JSON, so a facet never fails
 * the whole answer.
 */
async function tilequery(
  tileset: string,
  longitude: number,
  latitude: number,
  params: Record<string, string>,
  options: FacetOptions
): Promise<TilequeryFeature[] | undefined> {
  const url = new URL(
    `${options.apiEndpoint}v4/${tileset}/tilequery/${longitude},${latitude}.json`
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', options.accessToken);
  try {
    const response = await options.httpRequest(url.toString());
    if (!response.ok) return undefined;
    return (
      ((await response.json()) as { features?: TilequeryFeature[] }).features ??
      []
    );
  } catch {
    return undefined;
  }
}

/**
 * What the ground is at the point, from one point-in-polygon query on
 * Mapbox Streets v8: land use (park, cemetery, school...), protected
 * areas (national parks, with names) and the building it's inside.
 * Streets' landuse_overlay layer also holds wetlands, which are land use,
 * not protected areas.
 */
export async function landAt(
  longitude: number,
  latitude: number,
  options: FacetOptions
): Promise<Land | undefined> {
  const inside = await tilequery(
    STREETS_TILESET,
    longitude,
    latitude,
    { layers: 'landuse,landuse_overlay,building', limit: '20' },
    options
  );
  if (!inside) return undefined;
  const inLayer = (layer: string) =>
    inside.filter((f) => f.properties?.tilequery?.layer === layer);

  const overlay = inLayer('landuse_overlay');
  const isProtected = (f: TilequeryFeature) =>
    f.properties?.class === 'national_park';

  const land: Land = {
    land_use: [
      ...inLayer('landuse'),
      ...overlay.filter((f) => !isProtected(f))
    ].map((f) => ({
      class: f.properties?.class ?? 'unknown',
      ...(f.properties?.type && f.properties.type !== f.properties.class
        ? { type: f.properties.type }
        : {})
    }))
  };

  const protectedAreas = overlay.filter(isProtected).map((f) => ({
    class: f.properties?.class ?? 'unknown',
    ...(f.properties?.name ? { name: f.properties.name } : {})
  }));
  if (protectedAreas.length) land.protected_areas = protectedAreas;

  const building = inLayer('building')[0]?.properties;
  if (building) {
    land.building = {
      ...(building.type ? { type: building.type } : {}),
      ...(typeof building.height === 'number'
        ? { height_m: building.height }
        : {}),
      ...(building.underground === 'true' ? { underground: true } : {})
    };
  }
  return land;
}

/**
 * Whether the point is on water, or how far the nearest water (lake, sea,
 * river, stream) is within WATER_RADIUS_M. Tilequery gives a point inside
 * a water polygon distance 0.
 */
export async function waterNear(
  longitude: number,
  latitude: number,
  options: FacetOptions
): Promise<Water | undefined> {
  const near = await tilequery(
    STREETS_TILESET,
    longitude,
    latitude,
    { layers: 'water,waterway', radius: String(WATER_RADIUS_M), limit: '1' },
    options
  );
  if (!near) return undefined;
  const distance = near[0]?.properties?.tilequery?.distance;
  if (typeof distance !== 'number') return { on_water: false };
  return distance === 0
    ? { on_water: true }
    : { on_water: false, nearest_water_m: Math.round(distance) };
}

/**
 * Live congestion on the roads within TRAFFIC_RADIUS_M, from Mapbox
 * Traffic v1: one entry per road class, at its worst level, nearest
 * first. The tiles carry road class but no street names, and quiet
 * streets often have no traffic data at all.
 */
export async function trafficNear(
  longitude: number,
  latitude: number,
  options: FacetOptions
): Promise<Traffic | undefined> {
  const near = await tilequery(
    TRAFFIC_TILESET,
    longitude,
    latitude,
    { layers: 'traffic', radius: String(TRAFFIC_RADIUS_M), limit: '50' },
    options
  );
  if (!near) return undefined;

  const rank = (c: string) =>
    CONGESTION.indexOf(c as (typeof CONGESTION)[number]);
  const byClass = new Map<string, Traffic['roads'][number]>();
  for (const f of near) {
    const congestion = f.properties?.congestion;
    if (!congestion || rank(congestion) < 0) continue;
    const roadClass = f.properties?.class ?? 'road';
    const distance = Math.round(f.properties?.tilequery?.distance ?? 0);
    const seen = byClass.get(roadClass);
    if (!seen) {
      byClass.set(roadClass, {
        class: roadClass,
        congestion,
        distance_m: distance
      });
    } else if (rank(congestion) > rank(seen.congestion)) {
      seen.congestion = congestion;
      seen.distance_m = distance;
    }
  }
  const roads = [...byClass.values()].sort(
    (a, b) => a.distance_m - b.distance_m
  );
  const worst = roads.reduce<string | undefined>(
    (w, r) =>
      w === undefined || rank(r.congestion) > rank(w) ? r.congestion : w,
    undefined
  );
  return {
    radius_m: TRAFFIC_RADIUS_M,
    roads,
    ...(worst ? { worst } : {})
  };
}
