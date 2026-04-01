// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const PointsWithinPolygonOutputSchema = z.object({
  points_within: z
    .array(
      z.object({
        longitude: z.number(),
        latitude: z.number()
      })
    )
    .describe('Points that are inside the polygon'),
  count: z.number().describe('Number of points inside the polygon'),
  total: z.number().describe('Total number of input points tested')
});

export type PointsWithinPolygonOutput = z.infer<
  typeof PointsWithinPolygonOutputSchema
>;
