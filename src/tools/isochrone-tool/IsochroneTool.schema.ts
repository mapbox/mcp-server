// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const IsochroneInputSchema = z.object({
  profile: z
    .enum([
      'mapbox/driving-traffic',
      'mapbox/driving',
      'mapbox/cycling',
      'mapbox/walking'
    ])
    .default('mapbox/driving-traffic')
    .describe('Mode of travel.'),
  coordinates: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe(
      'A coordinate object with longitude and latitude properties around which to center the isochrone lines. Longitude: -180 to 180, Latitude: -85.0511 to 85.0511'
    ),

  contours_minutes: z
    .array(z.number().int().min(1).max(60))
    .max(4)
    .optional()
    .describe(
      'Contour times in minutes. Times must be in increasing order. Must be specified either contours_minutes or contours_meters.'
    ),

  contours_meters: z
    .array(z.number().int().min(1).max(100000))
    .max(4)
    .optional()
    .describe(
      'Distances in meters. Distances must be in increasing order. Must be specified either contours_minutes or contours_meters.'
    ),

  contours_colors: z
    .array(z.string().regex(/^[0-9a-fA-F]{6}$/))
    .max(4)
    .optional()
    .describe(
      'Contour colors as hex strings without starting # (for example ff0000 for red. must match contours_minutes or contours_meters length if provided).'
    ),

  polygons: z
    .boolean()
    .default(false)
    .optional()
    .describe('Whether to return Polygons (true) or LineStrings (false).'),

  denoise: z
    .number()
    .min(0)
    .max(1)
    .default(1)
    .optional()
    .describe(
      'A floating point value that can be used to remove smaller contours. A value of 1.0 will only return the largest contour for a given value.'
    ),

  generalize: z
    .number()
    .min(0)
    .describe(
      `Positive number in meters that is used to simplify geometries.
        - Walking: use 0-500. Prefer 50-200 for short contours (minutes < 10 or meters < 5000), 300-500 as they grow.
        - Driving: use 1000-5000. Start at 2000, use 3000 if minutes > 10 or meters > 20000. Use 4000-5000 if near 60 minutes or 100000 meters.
      `.trim()
    ),

  exclude: z
    .array(z.enum(['motorway', 'toll', 'ferry', 'unpaved', 'cash_only_tolls']))
    .optional()
    .describe('Exclude certain road types and custom locations from routing.'),

  depart_at: z
    .string()
    .optional()
    .describe(
      'An ISO 8601 date-time string representing the time to depart (format string: YYYY-MM-DDThh:mmss±hh:mm).'
    )
});
