// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const elevationPointSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  elevation_m: z.number()
});

const pathPointSchema = elevationPointSchema.extend({
  distance_m: z.number().describe('Distance along the path from its start')
});

export const ElevationOutputSchema = z.object({
  source: z.string().describe('Tileset the elevations were read from'),
  zoom: z.number().describe('Tile zoom used; lower on long paths'),
  resolution_m: z
    .number()
    .describe('Ground size of one elevation pixel at that zoom'),
  points: z.array(elevationPointSchema).optional(),
  path: z
    .object({
      distance_m: z.number(),
      sample_spacing_m: z.number(),
      sample_count: z.number(),
      climb_m: z.number(),
      descent_m: z.number(),
      start: pathPointSchema,
      end: pathPointSchema,
      highest: pathPointSchema,
      lowest: pathPointSchema,
      profile: z
        .array(z.object({ distance_m: z.number(), elevation_m: z.number() }))
        .describe('Up to 50 evenly spaced samples, for a chart')
    })
    .optional(),
  mapboxRender: z.object({ ref: z.string() }).passthrough().optional()
});

export type ElevationOutput = z.infer<typeof ElevationOutputSchema>;
