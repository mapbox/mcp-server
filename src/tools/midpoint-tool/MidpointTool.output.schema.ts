// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for MidpointTool
 */
export const MidpointOutputSchema = z.object({
  midpoint: z.object({
    longitude: z.number(),
    latitude: z.number()
  }),
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
 * Type inference for MidpointOutput
 */
export type MidpointOutput = z.infer<typeof MidpointOutputSchema>;
