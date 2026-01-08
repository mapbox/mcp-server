// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * Coordinate object schema with longitude and latitude
 */
const CoordinateSchema = z.object({
  longitude: z.number().min(-180).max(180).describe('Longitude: -180 to 180'),
  latitude: z.number().min(-90).max(90).describe('Latitude: -90 to 90')
});

/**
 * Input schema for DistanceTool
 */
export const DistanceInputSchema = z.object({
  from: CoordinateSchema.describe(
    'Starting coordinate with longitude and latitude'
  ),
  to: CoordinateSchema.describe(
    'Ending coordinate with longitude and latitude'
  ),
  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet', 'nauticalmiles'])
    .optional()
    .default('kilometers')
    .describe('Unit of measurement for distance')
});

/**
 * Type inference for DistanceInput
 */
export type DistanceInput = z.infer<typeof DistanceInputSchema>;
