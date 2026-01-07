// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for BoundingBoxTool
 */
export const BoundingBoxOutputSchema = z.object({
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .describe('Bounding box as [minLon, minLat, maxLon, maxLat]')
});

/**
 * Type inference for BoundingBoxOutput
 */
export type BoundingBoxOutput = z.infer<typeof BoundingBoxOutputSchema>;
