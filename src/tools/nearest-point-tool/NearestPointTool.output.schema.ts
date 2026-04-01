// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const NearestPointOutputSchema = z.object({
  nearest: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('The nearest point'),
  distance: z.number().describe('Distance from target to nearest point'),
  units: z.string().describe('Distance units'),
  index: z.number().describe('Index of the nearest point in the input array')
});

export type NearestPointOutput = z.infer<typeof NearestPointOutputSchema>;
