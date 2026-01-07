// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for SimplifyTool
 */
export const SimplifyOutputSchema = z.object({
  simplified: z
    .union([
      // LineString
      z.array(z.tuple([z.number(), z.number()])),
      // Polygon
      z.array(z.array(z.tuple([z.number(), z.number()])))
    ])
    .describe('Simplified geometry coordinates'),
  originalVertexCount: z.number(),
  simplifiedVertexCount: z.number(),
  reductionPercentage: z.number()
});

/**
 * Type inference for SimplifyOutput
 */
export type SimplifyOutput = z.infer<typeof SimplifyOutputSchema>;
