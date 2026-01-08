// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Waypoint schema - snapped coordinates on the road network
 */
const waypointSchema = z
  .object({
    name: z.string().optional().describe('Name of the road/path at this point'),
    location: z
      .tuple([z.number(), z.number()])
      .describe('Snapped coordinate as [longitude, latitude]'),
    trips_index: z
      .number()
      .describe('Index of the trip this waypoint belongs to'),
    waypoint_index: z
      .number()
      .describe('Position of this waypoint within its trip')
  })
  .passthrough();

/**
 * Leg schema - segment between two waypoints
 */
const legSchema = z
  .object({
    distance: z.number().describe('Distance for this leg in meters'),
    duration: z.number().describe('Duration for this leg in seconds'),
    steps: z
      .array(z.any())
      .optional()
      .describe('Turn-by-turn instructions (if steps=true)'),
    summary: z
      .string()
      .optional()
      .describe('Summary of the leg (if available)'),
    annotation: z
      .object({
        duration: z.array(z.number()).optional(),
        distance: z.array(z.number()).optional(),
        speed: z.array(z.number()).optional()
      })
      .optional()
      .describe('Detailed annotations for the leg (if requested)')
  })
  .passthrough();

/**
 * Trip schema - the optimized route
 */
const tripSchema = z
  .object({
    geometry: z
      .union([z.string(), z.any()])
      .describe(
        'Route geometry as GeoJSON LineString or encoded polyline string'
      ),
    legs: z.array(legSchema).describe('Array of legs between waypoints'),
    weight: z.number().describe('Weight value used in optimization'),
    weight_name: z
      .string()
      .optional()
      .describe('Name of weight type used (default: "routability")'),
    duration: z.number().describe('Total trip duration in seconds'),
    distance: z.number().describe('Total trip distance in meters')
  })
  .passthrough();

/**
 * Output schema for OptimizationTool (V1 API)
 *
 * Returns the optimized trip through all input coordinates.
 */
export const OptimizationOutputSchema = z
  .object({
    code: z
      .string()
      .describe('Status code (e.g., "Ok" for success, error code otherwise)'),
    waypoints: z
      .array(waypointSchema)
      .describe(
        'Input coordinates snapped to the road network in optimized order'
      ),
    trips: z
      .array(tripSchema)
      .describe(
        'Array containing the optimized trip (typically 1 trip for all waypoints)'
      ),
    // Error response fields
    message: z.string().optional().describe('Error message if code is not "Ok"')
  })
  .passthrough();

/**
 * Type inference for OptimizationOutput
 */
export type OptimizationOutput = z.infer<typeof OptimizationOutputSchema>;
