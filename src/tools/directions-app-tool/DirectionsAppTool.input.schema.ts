// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const DirectionsAppInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2)
    .max(25)
    .describe('Ordered list of waypoints (start, optional vias, end).'),
  routing_profile: z
    .enum([
      'mapbox/driving',
      'mapbox/driving-traffic',
      'mapbox/walking',
      'mapbox/cycling'
    ])
    .default('mapbox/driving')
    .describe('Mapbox routing profile to use.')
});

export type DirectionsAppInput = z.infer<typeof DirectionsAppInputSchema>;
