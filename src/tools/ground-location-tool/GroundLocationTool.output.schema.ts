// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const PoiSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  longitude: z.number(),
  latitude: z.number(),
  category: z.string().optional(),
  distance_meters: z.number().optional()
});

export const IsochroneSummarySchema = z.object({
  profile: z.string(),
  contours_minutes: z.array(z.number()),
  contour_areas_sqkm: z.array(z.number()).optional()
});

export const GroundLocationOutputSchema = z.object({
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
  citations: z
    .array(z.string())
    .describe('Mapbox APIs used to produce this grounded response')
});

export type GroundLocationOutput = z.infer<typeof GroundLocationOutputSchema>;
