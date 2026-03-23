// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const NearestPointInputSchema = z.object({
  target: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('The reference point to measure from'),

  points: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      })
    )
    .min(1)
    .describe('Candidate points to search'),

  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet'])
    .default('meters')
    .describe('Distance units for the result')
});

export type NearestPointInput = z.infer<typeof NearestPointInputSchema>;
