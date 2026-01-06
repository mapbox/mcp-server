// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { OptimizationInputSchema } from './OptimizationTool.input.schema.js';
import {
  OptimizationOutputSchema,
  type OptimizationOutput
} from './OptimizationTool.output.schema.js';

// API documentation: https://docs.mapbox.com/api/navigation/optimization-v1/

/**
 * OptimizationTool - Solves traveling salesman problems using the Mapbox Optimization API v1.
 * Returns a duration-optimized route visiting all input coordinates.
 */
export class OptimizationTool extends MapboxApiBasedTool<
  typeof OptimizationInputSchema,
  typeof OptimizationOutputSchema
> {
  name = 'optimization_tool';
  description =
    'Solves traveling salesman problems using the Mapbox Optimization API v1. ' +
    'Finds the optimal order to visit 2-12 coordinates, minimizing total travel time. ' +
    'Returns waypoints in optimized order with complete route details including distance, duration, and optional geometry.\n\n' +
    'USAGE:\n' +
    'Provide an array of 2-12 coordinates in {longitude, latitude} format and optionally a routing profile. ' +
    'The API will determine the most efficient visiting order and return:\n' +
    '- Optimized waypoint sequence\n' +
    '- Total trip distance and duration\n' +
    '- Route geometry (if requested)\n' +
    '- Turn-by-turn instructions (if requested)\n\n' +
    'KEY PARAMETERS:\n' +
    '- coordinates: 2-12 location pairs (required)\n' +
    '- profile: Routing mode (driving/walking/cycling/driving-traffic, default: driving)\n' +
    '- roundtrip: Return to start (default: true)\n' +
    '- source: Starting point ("first" or "any")\n' +
    '- destination: Ending point ("last" or "any")\n' +
    '- geometries: Route geometry format ("geojson" for visualization)\n' +
    '- steps: Include turn-by-turn instructions\n' +
    '- annotations: Additional metadata (duration, distance, speed)\n\n' +
    'ADVANCED FEATURES:\n' +
    '- distributions: Specify pickup/dropoff pairs to ensure pickups happen before dropoffs\n' +
    '- radiuses: Control snap distance to roads for each waypoint\n' +
    '- bearings: Influence route based on travel direction\n' +
    '- approaches: Control which side of the road to approach from\n\n' +
    'OUTPUT FORMAT:\n' +
    'Returns a single optimized trip with:\n' +
    '- waypoints: Array of locations in the optimal visiting order with their original indices\n' +
    '- trips[0].distance: Total distance in meters\n' +
    '- trips[0].duration: Total duration in seconds\n' +
    '- trips[0].legs: Array of route segments between consecutive waypoints\n' +
    '- trips[0].geometry: Complete route path (if requested)\n\n' +
    'PRESENTING RESULTS:\n' +
    'When sharing results, present: (1) The optimized waypoint order showing original positions ' +
    '(e.g., "location-2 → location-0 → location-1"). (2) Total distance and duration. ' +
    '(3) Individual leg details if relevant. Use waypoint_index to reference original coordinate positions.\n\n' +
    'LIMITATIONS:\n' +
    '- Maximum 12 coordinates per request\n' +
    '- Maximum 25 pickup/dropoff pairs in distributions\n' +
    '- For larger problems, consider splitting into multiple smaller optimizations\n\n' +
    'IMPORTANT: Coordinates must be {longitude, latitude} objects where longitude comes first.';
  annotations = {
    title: 'Optimization Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  };

  constructor({ httpRequest }: { httpRequest: HttpRequest }) {
    super({
      inputSchema: OptimizationInputSchema,
      outputSchema: OptimizationOutputSchema,
      httpRequest
    });
  }

  /**
   * Execute the tool logic
   * @param input - Validated input from OptimizationInputSchema
   * @param accessToken - Mapbox access token
   * @returns CallToolResult with structured output
   */
  protected async execute(
    input: z.infer<typeof OptimizationInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Build coordinates string for URL path
    const coordinatesString = input.coordinates
      .map((coord) => `${coord.longitude},${coord.latitude}`)
      .join(';');

    // Extract profile (remove 'mapbox/' prefix for URL)
    const profile = input.profile || 'mapbox/driving';

    // Build query parameters
    const params = new URLSearchParams();
    params.append('access_token', accessToken);

    if (input.source) {
      params.append('source', input.source);
    }
    if (input.destination) {
      params.append('destination', input.destination);
    }
    if (input.roundtrip !== undefined) {
      params.append('roundtrip', String(input.roundtrip));
    }
    if (input.annotations) {
      params.append('annotations', input.annotations.join(','));
    }
    if (input.geometries) {
      params.append('geometries', input.geometries);
    }
    if (input.overview) {
      params.append('overview', input.overview);
    }
    if (input.steps !== undefined) {
      params.append('steps', String(input.steps));
    }
    if (input.radiuses) {
      params.append(
        'radiuses',
        input.radiuses
          .map((r) => (r === 'unlimited' ? 'unlimited' : String(r)))
          .join(';')
      );
    }
    if (input.approaches) {
      params.append('approaches', input.approaches.join(';'));
    }
    if (input.bearings) {
      params.append(
        'bearings',
        input.bearings.map((b) => `${b.angle},${b.range}`).join(';')
      );
    }
    if (input.distributions) {
      params.append(
        'distributions',
        input.distributions.map((d) => `${d.pickup},${d.dropoff}`).join(';')
      );
    }

    // Build API URL
    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}optimized-trips/v1/${profile}/${coordinatesString}?${params.toString()}`;

    // Make request
    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Request failed with status ${response.status}: ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `${errorMessage} - ${errorJson.message}`;
        }
      } catch {
        // If parsing fails, use the raw text
        if (errorText) {
          errorMessage = `${errorMessage} - ${errorText}`;
        }
      }

      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }

    const result = (await response.json()) as OptimizationOutput;

    // Check for API-level errors (code !== "Ok")
    if (result.code && result.code !== 'Ok') {
      return {
        content: [
          {
            type: 'text',
            text: `API Error: ${result.code}${result.message ? ` - ${result.message}` : ''}`
          }
        ],
        isError: true
      };
    }

    // Validate the response against our output schema
    try {
      const validatedData = OptimizationOutputSchema.parse(result);

      return {
        content: [
          { type: 'text', text: JSON.stringify(validatedData, null, 2) }
        ],
        structuredContent: validatedData,
        isError: false
      };
    } catch (validationError) {
      // If validation fails, return the raw result anyway with a warning
      this.log(
        'warning',
        `Schema validation warning: ${validationError instanceof Error ? validationError.message : String(validationError)}`
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: false
      };
    }
  }
}
