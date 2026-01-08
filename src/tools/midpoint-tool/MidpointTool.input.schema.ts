// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * Input schema for MidpointTool
 */
export const MidpointInputSchema = z.object({
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
 * Type inference for MidpointInput
 */
export type MidpointInput = z.infer<typeof MidpointInputSchema>;
