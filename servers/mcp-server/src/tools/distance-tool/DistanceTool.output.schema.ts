// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for DistanceTool
 */
export const DistanceOutputSchema = z.object({
  distance: z.number().describe('Calculated distance between points'),
  units: z.string().describe('Unit of measurement'),
  from: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('Starting coordinate'),
  to: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('Ending coordinate')
});

/**
 * Type inference for DistanceOutput
 */
export type DistanceOutput = z.infer<typeof DistanceOutputSchema>;
