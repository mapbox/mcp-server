// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const coordinateSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90)
});

/**
 * Input schema for ElevationTool. Exactly one of `points`, `path` or
 * `directions_ref` is required; the tool checks that itself so the
 * published JSON schema stays a plain object.
 */
export const ElevationInputSchema = z.object({
  points: z
    .array(coordinateSchema)
    .min(1)
    .max(25)
    .optional()
    .describe(
      'Up to 25 places to get the ground elevation of, e.g. a summit, a town or a campsite.'
    ),
  path: z
    .array(coordinateSchema)
    .min(2)
    .max(1000)
    .optional()
    .describe(
      'A line (hike, ride, run) as ordered coordinates, for climb, descent and an elevation profile along it. For a route from directions_tool, pass directions_ref instead.'
    ),
  directions_ref: z
    .string()
    .optional()
    .describe(
      'The structuredContent.mapboxRender.ref from a directions_tool result (mapbox://selffetch/directions?...), passed unchanged. The tool fetches the full route itself, so you never need to copy route geometry.'
    )
});

export type ElevationInput = z.infer<typeof ElevationInputSchema>;
