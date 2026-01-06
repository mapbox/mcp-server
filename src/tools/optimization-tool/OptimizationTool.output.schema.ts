// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Waypoint schema for optimized trips
 */
const waypointSchema = z
  .object({
    name: z.string().optional().describe('Street or location name'),
    location: z
      .tuple([z.number(), z.number()])
      .describe('Coordinates as [longitude, latitude]'),
    waypoint_index: z
      .number()
      .int()
      .describe('Index in the original coordinates array'),
    trips_index: z
      .number()
      .int()
      .describe('Index of the trip this waypoint belongs to')
  })
  .passthrough();

/**
 * Leg annotation schema
 */
const annotationSchema = z
  .object({
    duration: z
      .array(z.number())
      .optional()
      .describe('Duration of each segment in seconds'),
    distance: z
      .array(z.number())
      .optional()
      .describe('Distance of each segment in meters'),
    speed: z
      .array(z.number())
      .optional()
      .describe('Speed of each segment in meters per second')
  })
  .passthrough();

/**
 * Step schema for turn-by-turn instructions
 */
const stepSchema = z
  .object({
    distance: z.number().describe('Distance for this step in meters'),
    duration: z.number().describe('Duration for this step in seconds'),
    geometry: z
      .union([z.string(), z.object({})])
      .optional()
      .describe('Step geometry'),
    name: z.string().optional().describe('Street name'),
    mode: z.string().optional().describe('Mode of travel'),
    maneuver: z
      .object({})
      .passthrough()
      .optional()
      .describe('Maneuver details'),
    intersections: z
      .array(z.object({}).passthrough())
      .optional()
      .describe('Intersection details')
  })
  .passthrough();

/**
 * Leg schema - represents travel between two waypoints
 */
const legSchema = z
  .object({
    distance: z.number().describe('Distance for this leg in meters'),
    duration: z.number().describe('Duration for this leg in seconds'),
    weight: z.number().optional().describe('Weight for this leg'),
    weight_name: z.string().optional().describe('Name of the weight metric'),
    steps: z.array(stepSchema).optional().describe('Turn-by-turn instructions'),
    annotation: annotationSchema
      .optional()
      .describe('Detailed annotations for this leg')
  })
  .passthrough();

/**
 * Trip schema - represents one complete optimized route
 */
const tripSchema = z
  .object({
    geometry: z
      .union([z.string(), z.object({}).passthrough()])
      .optional()
      .describe('Route geometry (polyline, polyline6, or GeoJSON)'),
    legs: z.array(legSchema).describe('Array of legs between waypoints'),
    weight: z.number().optional().describe('Total weight for the trip'),
    weight_name: z.string().optional().describe('Name of the weight metric'),
    duration: z.number().describe('Total duration in seconds'),
    distance: z.number().describe('Total distance in meters')
  })
  .passthrough();

/**
 * Output schema for OptimizationTool (Mapbox Optimization API v1)
 */
export const OptimizationOutputSchema = z
  .object({
    code: z
      .string()
      .describe(
        'Response code: "Ok" for success, "NoRoute" if no route found, error codes for failures'
      ),
    waypoints: z
      .array(waypointSchema)
      .optional()
      .describe('Array of waypoints in the optimized order'),
    trips: z
      .array(tripSchema)
      .optional()
      .describe(
        'Array of optimized trips (typically one trip with all waypoints)'
      ),
    // Error response fields
    message: z.string().optional().describe('Error message if code is not "Ok"')
  })
  .passthrough();

/**
 * Type inference for OptimizationOutput
 */
export type OptimizationOutput = z.infer<typeof OptimizationOutputSchema>;
