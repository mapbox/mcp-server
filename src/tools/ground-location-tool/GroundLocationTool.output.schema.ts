// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const PoiSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  longitude: z.number(),
  latitude: z.number(),
  category: z.string().optional(),
  distance_meters: z.number().optional(),
  mapbox_id: z
    .string()
    .optional()
    .describe(
      'Mapbox id for this place. Pass it to place_details_tool to retrieve ratings, popularity, opening hours, and phone number.'
    ),
  external_ids: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Upstream supplier ids for this place, keyed by supplier (e.g. dataplor, tripadvisor). Use to attribute where the record came from.'
    )
});

export const IsochroneSummarySchema = z.object({
  profile: z.string(),
  contours_minutes: z.array(z.number()),
  contour_areas_sqkm: z.array(z.number()).optional()
});

export const LandSchema = z.object({
  land_use: z
    .array(z.object({ class: z.string(), type: z.string().optional() }))
    .describe(
      'Land use polygons the point is inside, e.g. park, cemetery, school, hospital, residential, commercial_area, wood, grass. Empty when none is mapped there.'
    ),
  protected_areas: z
    .array(z.object({ class: z.string(), name: z.string().optional() }))
    .optional()
    .describe('Protected areas the point is inside, e.g. a national_park'),
  building: z
    .object({
      type: z.string().optional(),
      height_m: z.number().optional(),
      underground: z.boolean().optional()
    })
    .optional()
    .describe('The building the point is inside, if any')
});

export const WaterSchema = z.object({
  on_water: z
    .boolean()
    .describe('Whether the point is on a lake, river or sea'),
  nearest_water_m: z
    .number()
    .optional()
    .describe(
      'Distance to the nearest water within 500 m, when not on water. Absent with on_water false: no water within 500 m.'
    )
});

export const TrafficSchema = z.object({
  radius_m: z.number().describe('How far around the point roads were read'),
  roads: z
    .array(
      z.object({
        class: z
          .string()
          .describe('Road class, e.g. motorway, primary, secondary, street'),
        congestion: z
          .string()
          .describe('Live congestion: low, moderate, heavy or severe'),
        distance_m: z.number()
      })
    )
    .describe(
      'One entry per road class, at its worst level, nearest first. Empty means no live traffic data nearby (common on quiet streets), not no traffic.'
    ),
  worst: z
    .string()
    .optional()
    .describe('Worst congestion on any of those roads')
});

import { MapAppRefSchema } from '../../utils/storeMapPayload.js';

export const GroundLocationOutputSchema = z
  .object({
    place: z
      .string()
      .describe('Human-readable place name from reverse geocoding'),
    full_address: z.string().optional().describe('Full address if available'),
    longitude: z.number(),
    latitude: z.number(),
    nearby_pois: z
      .array(PoiSchema)
      .optional()
      .describe('Nearby points of interest matching the query'),
    isochrone: IsochroneSummarySchema.optional().describe(
      'Travel-time reachability summary'
    ),
    land: LandSchema.optional().describe(
      'What the ground is at the point, from Mapbox Streets (include: land)'
    ),
    water: WaterSchema.optional().describe(
      'On water, or distance to the nearest water (include: water)'
    ),
    traffic: TrafficSchema.optional().describe(
      'Live traffic on nearby roads, from Mapbox Traffic (include: traffic)'
    ),
    elevation_m: z
      .number()
      .optional()
      .describe(
        'Ground elevation above sea level, from Mapbox Terrain-DEM (include: elevation)'
      ),
    citations: z
      .array(z.string())
      .describe('Mapbox APIs used to produce this grounded response'),
    mapboxRender: MapAppRefSchema.optional()
  })
  .passthrough();

export type GroundLocationOutput = z.infer<typeof GroundLocationOutputSchema>;
