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

//  * Input schema for OptimizationTool (Minimal)
//  *
//  * Accepts an array of coordinates and a routing profile.
//  * The tool internally converts this to the full Optimization API v2 request format.

const optionsSchema = z.object({
  objectives: z
    .array(
      z.enum(['min-total-travel-duration', 'min-schedule-completion-time'])
    )
    .optional()
    .describe('Optimization objectives')
});

const iso8601Schema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?([+-]\d{2}:\d{2}|Z)?$/,
    'Must be a valid ISO 8601 datetime string (e.g., 2023-07-22T14:29:23-07:00)'
  );

const timeWindowSchema = z.object({
  earliest: iso8601Schema.describe('Earliest time for this window'),
  latest: iso8601Schema.describe('Latest time for this window'),
  type: z
    .enum(['strict', 'soft', 'soft_start', 'soft_end'])
    .optional()
    .describe('Type of time window constraint')
});

const vehicleBreakSchema = z.object({
  earliest_start: iso8601Schema.describe('Earliest start time for break'),
  latest_end: iso8601Schema.describe('Latest end time for break'),
  duration: z.number().int().positive().describe('Break duration in seconds')
});

const vehicleSchema = z.object({
  name: z.string().describe('Unique identifier for this vehicle'),
  routing_profile: profileSchema
    .optional()
    .describe('Routing profile for this vehicle'),
  start_location: z
    .string()
    .optional()
    .describe(
      'Starting location as a STRING name (e.g., "location-0" for coordinates[0], NOT the integer 0)'
    ),
  end_location: z
    .string()
    .optional()
    .describe(
      'Ending location as a STRING name (e.g., "location-0" for coordinates[0], NOT the integer 0)'
    ),
  capacities: z
    .record(z.number())
    .optional()
    .describe('Custom capacity dimensions (e.g., weight, volume)'),
  capabilities: z
    .array(z.string())
    .optional()
    .describe('Required vehicle capabilities'),
  earliest_start: iso8601Schema
    .optional()
    .describe('Earliest operation start time'),
  latest_end: iso8601Schema.optional().describe('Latest operation end time'),
  breaks: z
    .array(vehicleBreakSchema)
    .optional()
    .describe('Vehicle break requirements'),
  loading_policy: z
    .enum(['any', 'fifo', 'lifo'])
    .optional()
    .describe('Loading/unloading policy')
});

const serviceSchema = z.object({
  name: z.string().describe('Unique identifier for this service'),
  location: z
    .string()
    .describe(
      'Location as a STRING name where service is performed. Use "location-0" for coordinates[0], "location-1" for coordinates[1], etc. (NOT integers like 0, 1, 2)'
    ),
  duration: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(0)
    .describe('Service duration in seconds'),
  requirements: z
    .array(z.string())
    .optional()
    .describe('Required vehicle capabilities'),
  service_times: z
    .array(timeWindowSchema)
    .optional()
    .describe('Time window constraints for service')
});

const shipmentSchema = z.object({
  name: z.string().describe('Unique identifier for this shipment'),
  from: z
    .string()
    .describe(
      'Pickup location as a STRING name (e.g., "location-0" for coordinates[0], NOT the integer 0)'
    ),
  to: z
    .string()
    .describe(
      'Delivery location as a STRING name (e.g., "location-0" for coordinates[0], NOT the integer 0)'
    ),
  size: z
    .record(z.number())
    .optional()
    .describe('Capacity consumption (weight, volume, etc.)'),
  requirements: z
    .array(z.string())
    .optional()
    .describe('Required vehicle capabilities'),
  pickup_duration: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(0)
    .describe('Pickup duration in seconds'),
  dropoff_duration: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(0)
    .describe('Dropoff duration in seconds'),
  pickup_times: z
    .array(timeWindowSchema)
    .optional()
    .describe('Time window constraints for pickup'),
  dropoff_times: z
    .array(timeWindowSchema)
    .optional()
    .describe('Time window constraints for dropoff')
});

export const OptimizationInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least 2 coordinates are required')
    .max(1000, 'Maximum 1000 coordinates allowed')
    .describe(
      'Array of {longitude, latitude} coordinate pairs to optimize a route through. ' +
        'Must include at least 2 coordinate pairs. ' +
        'Up to 1000 coordinates total are supported.'
    ),
  profile: profileSchema
    .optional()
    .default('mapbox/driving')
    .describe('Routing profile to use for optimization'),
  vehicles: z
    .array(vehicleSchema)
    .optional()
    .describe(
      'Array of vehicle objects. If not provided, a default vehicle will be created automatically. ' +
        'IMPORTANT: If you provide vehicles, you MUST also provide either "services" or "shipments" to define the stops each vehicle should visit.'
    ),
  services: z
    .array(serviceSchema)
    .optional()
    .describe(
      'Array of service objects representing individual stops/tasks (e.g., deliveries, pickups, visits). ' +
        'Each service is performed at a single location. Required when using custom vehicles.'
    ),
  shipments: z
    .array(shipmentSchema)
    .optional()
    .describe(
      'Array of shipment objects representing paired pickup/delivery tasks. ' +
        'Each shipment has a pickup location and a delivery location. Can be used with or instead of services when using custom vehicles.'
    ),
  options: optionsSchema.optional().describe('Optimization options'),
  max_polling_attempts: z
    .number()
    .int()
    .positive()
    .optional()
    .default(30)
    .describe('Maximum number of polling attempts (default: 30)'),
  polling_interval_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1000)
    .describe('Polling interval in milliseconds (default: 1000)')
});

export type OptimizationInput = z.infer<typeof OptimizationInputSchema>;
