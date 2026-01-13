// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Stop schema for route stops
 * Made flexible to handle various API response formats
 */
const stopSchema = z
  .object({
    type: z
      .string()
      .describe(
        'Type of stop. Known values include "start" (vehicle begins), "service" (perform service), "pickup"/"dropoff" (shipment handling), "break" (vehicle break), "end" (vehicle finishes). Additional values may be returned as the API evolves.'
      ),
    location: z
      .string()
      .describe(
        'Location name for this stop (e.g., "location-0", "location-1")'
      ),
    eta: z
      .string()
      .optional()
      .describe(
        'Estimated time of arrival in ISO 8601 format (e.g., "2023-07-22T14:29:23-07:00")'
      ),
    odometer: z
      .number()
      .optional()
      .describe('Total distance traveled to reach this stop in meters'),
    wait: z
      .number()
      .optional()
      .describe('Wait time at this stop in seconds before proceeding'),
    duration: z
      .number()
      .optional()
      .describe('Duration of service/activity at this stop in seconds'),
    services: z
      .array(z.string())
      .optional()
      .describe('Array of service names fulfilled at this stop'),
    pickups: z
      .array(z.string())
      .optional()
      .describe('Array of shipment names picked up at this stop'),
    dropoffs: z
      .array(z.string())
      .optional()
      .describe('Array of shipment names dropped off at this stop')
  })
  .passthrough(); // Allow additional fields from API

/**
 * Route schema
 */
const routeSchema = z
  .object({
    vehicle: z
      .string()
      .describe(
        'Vehicle name for this route (matches the vehicle name from input)'
      ),
    stops: z
      .array(stopSchema)
      .describe(
        'Ordered sequence of stops for this vehicle, from start to end. Includes all services, pickups, dropoffs, and breaks in optimized order.'
      )
  })
  .passthrough(); // Allow additional fields from API

/**
 * Dropped items schema
 */
const droppedSchema = z
  .object({
    services: z
      .array(z.string())
      .optional()
      .describe(
        'Array of service names that could not be fulfilled due to constraints (e.g., time windows, capacity, capabilities)'
      ),
    shipments: z
      .array(z.string())
      .optional()
      .describe(
        'Array of shipment names that could not be fulfilled due to constraints (e.g., time windows, capacity, capabilities)'
      )
  })
  .passthrough(); // Allow additional fields from API

/**
 * Output schema for OptimizationV2Tool (V2 API - Beta)
 * Uses passthrough to be flexible with API response variations
 */
export const OptimizationV2OutputSchema = z
  .object({
    version: z
      .number()
      .optional()
      .describe('API version number (always 1 for Optimization API v2)'),
    dropped: droppedSchema
      .optional()
      .describe(
        'Items that could not be fulfilled in the optimization. If present, contains arrays of service/shipment names that were dropped.'
      ),
    routes: z
      .array(routeSchema)
      .optional()
      .describe(
        'Array of optimized routes, one per vehicle. Each route contains the vehicle name and an ordered sequence of stops. May be undefined if optimization fails completely.'
      ),
    // Error response fields from API
    code: z
      .string()
      .optional()
      .describe(
        'Error code from API (e.g., "internal_error"). Present only when the API returns an error response.'
      ),
    message: z
      .string()
      .optional()
      .describe(
        'Human-readable error message from API. Present only when the API returns an error response.'
      ),
    ref: z
      .string()
      .optional()
      .describe(
        'Reference ID for the error from API. Present only when the API returns an error response.'
      )
  })
  .passthrough(); // Allow additional fields from API

/**
 * Type inference for OptimizationV2Output
 */
export type OptimizationV2Output = z.infer<typeof OptimizationV2OutputSchema>;
