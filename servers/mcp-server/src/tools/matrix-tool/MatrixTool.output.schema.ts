// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Waypoint object schema (used for both sources and destinations)
const MatrixWaypointSchema = z.object({
  name: z.string(),
  location: z.tuple([z.number(), z.number()]),
  distance: z.number()
});

// Main Matrix API response schema
export const MatrixResponseSchema = z.object({
  code: z.string(),
  durations: z.array(z.array(z.number().nullable())).optional(),
  distances: z.array(z.array(z.number().nullable())).optional(),
  // A waypoint is null when its coordinate can't be snapped to the road
  // network (for example, a point in the water).
  sources: z.array(MatrixWaypointSchema.nullable()),
  destinations: z.array(MatrixWaypointSchema.nullable()),
  message: z.string().optional() // Present in error responses
});

export type MatrixResponse = z.infer<typeof MatrixResponseSchema>;
export type MatrixWaypoint = z.infer<typeof MatrixWaypointSchema>;
