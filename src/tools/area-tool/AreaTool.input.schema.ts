// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

/**
 * Input schema for AreaTool
 */
export const AreaInputSchema = z.object({
  geometry: z
    .union([
      // Polygon
      z.array(z.array(CoordinateSchema)).min(1),
      // MultiPolygon
      z.array(z.array(z.array(CoordinateSchema))).min(1)
    ])
    .describe(
      'Polygon or MultiPolygon coordinates. ' +
        'Polygon: array of rings (first is outer, rest are holes). ' +
        'MultiPolygon: array of polygons.'
    ),
  units: z
    .enum(['meters', 'kilometers', 'feet', 'miles', 'acres', 'hectares'])
    .optional()
    .default('meters')
    .describe('Unit of measurement for area')
});

/**
 * Type inference for AreaInput
 */
export type AreaInput = z.infer<typeof AreaInputSchema>;
