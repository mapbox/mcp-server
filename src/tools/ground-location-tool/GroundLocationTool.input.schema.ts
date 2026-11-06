// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { languageSchema } from '../../schemas/shared.js';

export const GroundLocationInputSchema = z.object({
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe('Longitude of the location to ground responses around'),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .describe('Latitude of the location to ground responses around'),
  query: z
    .string()
    .optional()
    .describe(
      'Optional category or type of places to search for nearby (e.g., "restaurant", "coffee", "park"). If omitted, returns general place context only.'
    ),
  profile: z
    .enum([
      'mapbox/walking',
      'mapbox/driving',
      'mapbox/driving-traffic',
      'mapbox/cycling'
    ])
    .optional()
    .default('mapbox/walking')
    .describe(
      'Travel profile for isochrone calculation. Use "mapbox/driving-traffic" for traffic-aware driving. Defaults to "mapbox/walking".'
    ),
  contours_minutes: z
    .array(z.number().min(1).max(60))
    .optional()
    .default([5, 10, 15])
    .describe(
      'Travel-time thresholds in minutes for the isochrone. Max 4 values, each between 1-60.'
    ),
  limit: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe('Maximum number of nearby POIs to return (1-25)'),
  language: languageSchema.optional(),
  include: z
    .array(z.enum(['land', 'water', 'elevation', 'traffic']))
    .optional()
    .describe(
      'What to report about the spot itself, each one extra request: ' +
        '"land" for land use (park, cemetery, school, residential...), a national park or other protected area, and the building it is in; ' +
        '"water" for whether it is on water and how far the nearest water is; ' +
        '"elevation" for height above sea level; ' +
        '"traffic" for live congestion on the roads around it. ' +
        'Pick what the question needs, e.g. ["traffic"] for "how bad is traffic at this address?". Defaults to ["land"].'
    )
});

export type GroundLocationInput = z.infer<typeof GroundLocationInputSchema>;
