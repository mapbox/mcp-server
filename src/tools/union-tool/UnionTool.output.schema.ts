// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const UnionOutputSchema = z.object({
  geometry: z
    .record(z.unknown())
    .describe(
      'GeoJSON geometry of the merged polygon (Polygon or MultiPolygon)'
    ),
  type: z.string().describe('Geometry type: Polygon or MultiPolygon')
});

export type UnionOutput = z.infer<typeof UnionOutputSchema>;
