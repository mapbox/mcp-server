// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * Input schema for BearingTool
 */
export const BearingInputSchema = z.object({
  from: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('Starting coordinate'),
  to: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('Ending coordinate')
});

/**
 * Type inference for BearingInput
 */
export type BearingInput = z.infer<typeof BearingInputSchema>;
