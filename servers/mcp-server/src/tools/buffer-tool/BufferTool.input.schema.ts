// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

/**
 * Input schema for BufferTool
 */
export const BufferInputSchema = z.object({
  geometry: z
    .union([
      // Point
      z.array(z.number()).length(2),
      // LineString
      z.array(CoordinateSchema).min(2),
      // Polygon
      z.array(z.array(CoordinateSchema)).min(1)
    ])
    .describe('Geometry coordinates (Point, LineString, or Polygon)'),
  distance: z.number().positive().describe('Buffer distance'),
  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet'])
    .optional()
    .default('kilometers')
    .describe('Unit of measurement for distance')
});

/**
 * Type inference for BufferInput
 */
export type BufferInput = z.infer<typeof BufferInputSchema>;
