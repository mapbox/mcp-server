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
  sources: z.array(MatrixWaypointSchema),
  destinations: z.array(MatrixWaypointSchema),
  message: z.string().optional() // Present in error responses
});

export type MatrixResponse = z.infer<typeof MatrixResponseSchema>;
export type MatrixWaypoint = z.infer<typeof MatrixWaypointSchema>;
