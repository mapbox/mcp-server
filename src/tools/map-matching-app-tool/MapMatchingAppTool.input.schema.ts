// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const MapMatchingAppInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2)
    .max(100)
    .describe(
      'GPS trace as an array of {longitude, latitude} pairs, in recorded order. 2-100 points.'
    ),
  profile: z
    .enum(['driving', 'driving-traffic', 'walking', 'cycling'])
    .default('driving')
    .describe('Transport mode to snap the trace to.')
});

export type MapMatchingAppInput = z.infer<typeof MapMatchingAppInputSchema>;
