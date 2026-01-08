// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for PointInPolygonTool
 */
export const PointInPolygonOutputSchema = z.object({
  inside: z.boolean().describe('Whether the point is inside the polygon'),
  point: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('The tested point')
});

/**
 * Type inference for PointInPolygonOutput
 */
export type PointInPolygonOutput = z.infer<typeof PointInPolygonOutputSchema>;
