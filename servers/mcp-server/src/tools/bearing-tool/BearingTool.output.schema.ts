// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for BearingTool
 */
export const BearingOutputSchema = z.object({
  bearing: z.number().describe('Bearing in degrees (0-360, where 0 is North)'),
  from: z.object({
    longitude: z.number(),
    latitude: z.number()
  }),
  to: z.object({
    longitude: z.number(),
    latitude: z.number()
  })
});

/**
 * Type inference for BearingOutput
 */
export type BearingOutput = z.infer<typeof BearingOutputSchema>;
