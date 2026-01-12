// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

/**
 * Input schema for SimplifyTool
 */
export const SimplifyInputSchema = z.object({
  geometry: z
    .union([
      // LineString
      z.array(CoordinateSchema).min(2),
      // Polygon
      z.array(z.array(CoordinateSchema)).min(1)
    ])
    .describe('LineString or Polygon coordinates'),
  tolerance: z
    .number()
    .positive()
    .optional()
    .default(0.01)
    .describe(
      'Simplification tolerance (higher values = more simplification). Default: 0.01'
    ),
  highQuality: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Use high quality simplification (slower but more accurate). Default: false'
    )
});

/**
 * Type inference for SimplifyInput
 */
export type SimplifyInput = z.infer<typeof SimplifyInputSchema>;
