// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const OptimizationAppInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2)
    .max(12)
    .describe(
      'Between 2 and 12 stops to visit. Order does not matter — the tool returns the optimal visit order.'
    ),
  profile: z
    .enum([
      'mapbox/driving',
      'mapbox/driving-traffic',
      'mapbox/walking',
      'mapbox/cycling'
    ])
    .default('mapbox/driving')
    .describe('Mode of travel.'),
  source: z
    .enum(['any', 'first'])
    .default('any')
    .describe(
      '"first" pins the first input coordinate as the start; "any" lets the optimizer choose.'
    ),
  destination: z
    .enum(['any', 'last'])
    .default('any')
    .describe(
      '"last" pins the last input coordinate as the end; "any" lets the optimizer choose.'
    ),
  roundtrip: z
    .boolean()
    .default(true)
    .describe('If true, the trip returns to its starting waypoint.')
});

export type OptimizationAppInput = z.infer<typeof OptimizationAppInputSchema>;
