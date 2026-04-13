// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const IntersectOutputSchema = z.object({
  intersects: z.boolean().describe('Whether the two polygons overlap'),
  geometry: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe('GeoJSON geometry of the intersection, or null if no overlap')
});

export type IntersectOutput = z.infer<typeof IntersectOutputSchema>;
