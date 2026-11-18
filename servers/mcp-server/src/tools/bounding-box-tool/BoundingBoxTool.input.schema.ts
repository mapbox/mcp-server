// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

/**
 * Input schema for BoundingBoxTool
 */
export const BoundingBoxInputSchema = z.object({
  geometry: z
    .union([
      // Point
      z.array(z.number()).length(2),
      // LineString or array of points
      z.array(CoordinateSchema).min(1),
      // Polygon
      z.array(z.array(CoordinateSchema)).min(1),
      // MultiPolygon
      z.array(z.array(z.array(CoordinateSchema))).min(1)
    ])
    .describe(
      'Geometry coordinates (Point, LineString, Polygon, or MultiPolygon)'
    )
});

/**
 * Type inference for BoundingBoxInput
 */
export type BoundingBoxInput = z.infer<typeof BoundingBoxInputSchema>;
