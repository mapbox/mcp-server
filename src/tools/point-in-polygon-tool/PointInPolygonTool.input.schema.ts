// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * GeoJSON coordinate schema [longitude, latitude]
 */
const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

/**
 * Input schema for PointInPolygonTool
 */
export const PointInPolygonInputSchema = z.object({
  point: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('Point coordinate to test'),

  polygon: z
    .array(z.array(CoordinateSchema))
    .min(1)
    .describe(
      'Polygon coordinates as array of rings (first is outer, rest are holes). Each ring is [longitude, latitude] pairs.'
    )
});

/**
 * Type inference for PointInPolygonInput
 */
export type PointInPolygonInput = z.infer<typeof PointInPolygonInputSchema>;
