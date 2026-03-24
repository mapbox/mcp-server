// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const DestinationInputSchema = z.object({
  origin: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('Starting point'),

  distance: z.number().positive().describe('Distance to travel'),

  bearing: z
    .number()
    .min(-180)
    .max(180)
    .describe(
      'Direction of travel in degrees (0=north, 90=east, -90=west, 180=south)'
    ),

  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet'])
    .default('meters')
    .describe('Units for the distance')
});

export type DestinationInput = z.infer<typeof DestinationInputSchema>;
