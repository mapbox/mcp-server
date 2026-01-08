// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

// Profile schema (driving, walking, cycling, driving-traffic)
const profileSchema = z
  .enum([
    'mapbox/driving',
    'mapbox/walking',
    'mapbox/cycling',
    'mapbox/driving-traffic'
  ])
  .describe('Routing profile');

/**
 * Input schema for OptimizationTool (V1 API)
 *
 * The V1 Optimization API finds the optimal (shortest by travel time) route
 * through a set of coordinates, solving the Traveling Salesman Problem.
 */
export const OptimizationInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least 2 coordinates are required')
    .max(12, 'Maximum 12 coordinates allowed for V1 API')
    .describe(
      'Array of {longitude, latitude} coordinate pairs to optimize a route through. ' +
        'The V1 API supports 2-12 coordinates and returns the optimal visiting order.'
    ),
  profile: profileSchema
    .optional()
    .default('mapbox/driving')
    .describe('Routing profile to use for optimization'),
  source: z
    .enum(['any', 'first'])
    .optional()
    .default('any')
    .describe(
      'Location to start the trip. "any" allows any coordinate, "first" forces the first coordinate as start.'
    ),
  destination: z
    .enum(['any', 'last'])
    .optional()
    .default('any')
    .describe(
      'Location to end the trip. "any" allows any coordinate, "last" forces the last coordinate as end.'
    ),
  roundtrip: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Whether to return to the starting point. Set to false for one-way trips.'
    ),
  geometries: z
    .enum(['geojson', 'polyline', 'polyline6'])
    .optional()
    .default('geojson')
    .describe('Format for route geometry'),
  overview: z
    .enum(['full', 'simplified', 'false'])
    .optional()
    .default('simplified')
    .describe('Detail level of route geometry'),
  steps: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include turn-by-turn instructions'),
  annotations: z
    .array(z.enum(['duration', 'distance', 'speed']))
    .optional()
    .describe('Additional metadata to include for each route segment'),
  language: z
    .string()
    .optional()
    .describe(
      'Language for instructions (if steps=true). ISO 639-1 code (e.g., "en", "es").'
    )
});

export type OptimizationInput = z.infer<typeof OptimizationInputSchema>;
