// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const ConvexInputSchema = z.object({
  points: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      })
    )
    .min(3)
    .describe('Points to compute the convex hull from (minimum 3)')
});

export type ConvexInput = z.infer<typeof ConvexInputSchema>;
