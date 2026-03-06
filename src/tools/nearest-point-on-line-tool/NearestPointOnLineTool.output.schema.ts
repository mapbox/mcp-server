// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const NearestPointOnLineOutputSchema = z.object({
  nearest: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('The nearest point on the line'),
  distance: z
    .number()
    .describe('Distance from the input point to the nearest point on the line'),
  units: z.string().describe('Distance units'),
  location: z.number().describe('Distance along the line to the nearest point')
});

export type NearestPointOnLineOutput = z.infer<
  typeof NearestPointOnLineOutputSchema
>;
