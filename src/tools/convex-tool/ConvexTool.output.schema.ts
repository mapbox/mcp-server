// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const ConvexOutputSchema = z.object({
  geometry: z
    .record(z.unknown())
    .nullable()
    .describe(
      'GeoJSON Polygon geometry of the convex hull, or null if hull could not be computed'
    ),
  num_points: z.number().describe('Number of input points used')
});

export type ConvexOutput = z.infer<typeof ConvexOutputSchema>;
