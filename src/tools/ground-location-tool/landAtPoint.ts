// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { HttpRequest } from '../../utils/types.js';
import type { GroundLocationOutput } from './GroundLocationTool.output.schema.js';

export const STREETS_TILESET = 'mapbox.mapbox-streets-v8';
/** How far to look for the nearest water when the point isn't on it. */
export const WATER_RADIUS_M = 500;

type Land = NonNullable<GroundLocationOutput['land']>;

interface TilequeryFeature {
  properties?: {
    tilequery?: { distance?: number; layer?: string };
    class?: string;
    type?: string;
    name?: string;
    height?: number;
    underground?: string;
  };
}

interface TilequeryResponse {
  features?: TilequeryFeature[];
}

function tilequeryUrl(
  longitude: number,
  latitude: number,
  params: Record<string, string>,
  options: { accessToken: string; apiEndpoint: string }
): string {
  const url = new URL(
    `${options.apiEndpoint}v4/${STREETS_TILESET}/tilequery/${longitude},${latitude}.json`
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', options.accessToken);
  return url.toString();
}

/**
 * What the ground is at a point, from Mapbox Streets v8: land use (park,
 * cemetery, school...), protected areas (national parks, with names),
 * a building the point is inside, whether it's on water, and how far
 * the nearest water is within WATER_RADIUS_M. Two Tilequery requests: a
 * point-in-polygon query, and a radius query for the nearest water.
 * Returns undefined if the point-in-polygon request fails.
 */
export async function landAtPoint(
  longitude: number,
  latitude: number,
  options: {
    httpRequest: HttpRequest;
    accessToken: string;
    apiEndpoint: string;
  }
): Promise<Land | undefined> {
  const fetchFeatures = async (params: Record<string, string>) => {
    const response = await options.httpRequest(
      tilequeryUrl(longitude, latitude, params, options)
    );
    if (!response.ok) return undefined;
    return ((await response.json()) as TilequeryResponse).features ?? [];
  };

  const [inside, nearWater] = await Promise.all([
    fetchFeatures({
      layers: 'landuse,landuse_overlay,building,water',
      limit: '20'
    }),
    fetchFeatures({
      layers: 'water,waterway',
      radius: String(WATER_RADIUS_M),
      limit: '1'
    })
  ]);
  if (!inside) return undefined;

  const inLayer = (layer: string) =>
    inside.filter((f) => f.properties?.tilequery?.layer === layer);

  const land: Land = {
    land_use: inLayer('landuse').map((f) => ({
      class: f.properties?.class ?? 'unknown',
      ...(f.properties?.type && f.properties.type !== f.properties.class
        ? { type: f.properties.type }
        : {})
    })),
    on_water: inLayer('water').length > 0
  };

  const protectedAreas = inLayer('landuse_overlay').map((f) => ({
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

  const water = nearWater?.[0]?.properties?.tilequery?.distance;
  if (!land.on_water && typeof water === 'number') {
    land.nearest_water_m = Math.round(water);
  }
  return land;
}
