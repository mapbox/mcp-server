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
 * Input schema for OptimizationTool (Mapbox Optimization API v1)
 *
 * The Optimization API returns a duration-optimized route between the input coordinates.
 * This is a simplified traveling salesman problem (TSP) solver.
 */
export const OptimizationInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least 2 coordinates are required')
    .max(12, 'Maximum 12 coordinates allowed')
    .describe(
      'Array of {longitude, latitude} coordinate pairs to optimize a route through. ' +
        'Must include at least 2 and at most 12 coordinate pairs.'
    ),
  profile: profileSchema
    .optional()
    .default('mapbox/driving')
    .describe('Routing profile to use for optimization'),
  source: z
    .enum(['any', 'first'])
    .optional()
    .describe(
      'Starting waypoint. "first" (default) uses the first coordinate, "any" allows any coordinate as the start'
    ),
  destination: z
    .enum(['any', 'last'])
    .optional()
    .describe(
      'Ending waypoint. "last" (default) uses the last coordinate, "any" allows any coordinate as the end'
    ),
  roundtrip: z
    .boolean()
    .optional()
    .describe(
      'Return to the starting point. Default is true. Set to false for one-way trips.'
    ),
  annotations: z
    .array(z.enum(['duration', 'distance', 'speed']))
    .optional()
    .describe(
      'Additional metadata to include for each leg (duration, distance, speed)'
    ),
  geometries: z
    .enum(['geojson', 'polyline', 'polyline6'])
    .optional()
    .describe(
      'Format for route geometry. Default is "polyline". Use "geojson" for easy visualization.'
    ),
  overview: z
    .enum(['full', 'simplified', 'false'])
    .optional()
    .describe(
      'Level of detail for route geometry. "full" includes all points, "simplified" reduces points, "false" omits geometry.'
    ),
  steps: z
    .boolean()
    .optional()
    .describe('Include turn-by-turn instructions. Default is false.'),
  radiuses: z
    .array(z.union([z.number().nonnegative(), z.literal('unlimited')]))
    .optional()
    .describe(
      'Maximum distance in meters to snap each coordinate to the road network. Use "unlimited" for no limit.'
    ),
  approaches: z
    .array(z.enum(['unrestricted', 'curb']))
    .optional()
    .describe(
      'Side of the road to approach each waypoint from. "unrestricted" allows either side, "curb" uses driving side of region.'
    ),
  bearings: z
    .array(
      z.object({
        angle: z
          .number()
          .int()
          .min(0)
          .max(360)
          .describe('Angle in degrees from true north'),
        range: z
          .number()
          .int()
          .min(0)
          .max(180)
          .describe('Allowed deviation in degrees')
      })
    )
    .optional()
    .describe(
      'Directional constraints for each coordinate. Influences route selection based on travel direction.'
    ),
  distributions: z
    .array(
      z.object({
        pickup: z.number().int().min(0).describe('Index of pickup location'),
        dropoff: z.number().int().min(0).describe('Index of dropoff location')
      })
    )
    .optional()
    .describe(
      'Pickup and dropoff location pairs. Ensures pickup happens before dropoff in the optimized route.'
    )
});

export type OptimizationInput = z.infer<typeof OptimizationInputSchema>;
