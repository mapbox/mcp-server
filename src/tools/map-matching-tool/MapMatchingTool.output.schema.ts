// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// GeoJSON LineString schema
const GeoJSONLineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(
    z
      .tuple([z.number(), z.number()])
      .or(z.tuple([z.number(), z.number(), z.number()]))
  )
});

// Tracepoint schema - represents a snapped coordinate
const TracepointSchema = z.object({
  name: z.string().optional(),
  location: z.tuple([z.number(), z.number()]),
  waypoint_index: z.number().optional(),
  matchings_index: z.number(),
  alternatives_count: z.number()
});

// Matching schema - represents a matched route
const MatchingSchema = z.object({
  confidence: z.number().min(0).max(1),
  distance: z.number(),
  duration: z.number(),
  geometry: z.union([GeoJSONLineStringSchema, z.string()]),
  legs: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        annotation: z
          .object({
            speed: z.array(z.number()).optional(),
            distance: z.array(z.number()).optional(),
            duration: z.array(z.number()).optional(),
            congestion: z.array(z.string()).optional()
          })
          .optional()
      })
    )
    .optional()
});

// Main output schema
export const MapMatchingOutputSchema = z.object({
  code: z.string(),
  matchings: z.array(MatchingSchema),
  tracepoints: z.array(TracepointSchema.nullable())
});

export type MapMatchingOutput = z.infer<typeof MapMatchingOutputSchema>;
