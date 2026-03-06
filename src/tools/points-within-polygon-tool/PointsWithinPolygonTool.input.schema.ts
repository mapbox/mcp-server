// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

export const PointsWithinPolygonInputSchema = z.object({
  points: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      })
    )
    .min(1)
    .describe('Array of points to test against the polygon'),

  polygon: z
    .array(z.array(CoordinateSchema))
    .min(1)
    .describe(
      'Polygon coordinates as array of rings (first is outer, rest are holes). Each ring is [longitude, latitude] pairs.'
    )
});

export type PointsWithinPolygonInput = z.infer<
  typeof PointsWithinPolygonInputSchema
>;
