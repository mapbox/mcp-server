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

// API documentation: https://docs.mapbox.com/api/navigation/optimization/

/**
 * OptimizationTool - Solves vehicle routing problems using the Mapbox Optimization API v2.
 * Supports complex routing scenarios with multiple vehicles, time windows, capacities, and shipments.
 */
export class OptimizationTool extends MapboxApiBasedTool<
  typeof OptimizationInputSchema,
  typeof OptimizationOutputSchema
> {
  name = 'optimization_tool';
  description =
    'Solves vehicle routing problems using the Mapbox Optimization API v2. ' +
    'Supports up to 1000 coordinates in {longitude, latitude} format. ' +
    'Returns optimized routes with stops, ETAs, and dropped items. ' +
    '\n\n' +
    'USAGE MODES:\n' +
    '1. SIMPLIFIED MODE (recommended for basic routing): Provide only "coordinates" and optionally "profile". ' +
    'The tool will automatically create a default vehicle that visits all locations in optimized order, ' +
    'starting and ending at the first coordinate.\n' +
    '2. ADVANCED MODE (for complex scenarios): If you specify "vehicles", you MUST also provide either ' +
    '"services" (single stops like deliveries or pickups) or "shipments" (paired pickup/dropoff tasks). ' +
    'Each service/shipment defines a stop that vehicles must visit.\n' +
    '\n' +
    'KEY CONCEPTS:\n' +
    '- "services": Individual stops at locations (e.g., deliver package to address A, pick up at coffee shop B)\n' +
    '- "shipments": Paired pickup/delivery tasks (e.g., pick up from warehouse, deliver to customer)\n' +
    '- "vehicles": Routing agents with optional constraints like time windows, capacities, and capabilities\n' +
    '\n' +
    'LOCATION NAMING (CRITICAL):\n' +
    'The tool auto-generates STRING location names from your coordinates array as "location-0", "location-1", "location-2", etc. ' +
    'When creating services, shipments, or vehicles, you MUST reference these auto-generated STRINGS (NOT integers, NOT array indices):\n' +
    '- coordinates[0] → use STRING "location-0" (NOT integer 0)\n' +
    '\n' +
    'EXAMPLES:\n' +
    '✓ CORRECT: service.location = "location-2" (string)\n' +
    '✗ WRONG: service.location = 2 (integer)\n' +
    '\n' +
    'OUTPUT FORMAT:\n' +
    'The tool returns a solution with:\n' +
    '- "routes": Array of optimized routes, one per vehicle. Each route contains:\n' +
    '  - "vehicle": The vehicle name\n' +
    '  - "stops": Ordered array of stops with:\n' +
    '    - "type": start, service, pickup, dropoff, break, or end\n' +
    '    - "location": The location name (e.g., "location-0")\n' +
    '    - "eta": Estimated time of arrival (ISO 8601 timestamp)\n' +
    '    - "odometer": Total distance traveled in meters\n' +
    '    - "wait": Wait time in seconds before proceeding\n' +
    '    - "duration": Service time in seconds\n' +
    '    - "services": Array of service names fulfilled at this stop\n' +
    '    - "pickups"/"dropoffs": Arrays of shipment names handled\n' +
    '- "dropped": Object with "services" and "shipments" arrays listing items that could not be fulfilled\n' +
    '\n' +
    'WORKING WITH RESPONSES:\n' +
    'The tool returns structured data that you can access directly as an object/dictionary. ' +
    'DO NOT try to parse the response as a JSON string - access it as structured data instead. ' +
    'For large responses: (1) Access routes directly: result.routes[0], result.routes[1], etc. ' +
    '(2) Iterate through routes: for route in result.routes. ' +
    '(3) Access stop data: route.stops[i].location, route.stops[i].eta, etc. ' +
    '(4) Extract only the fields you need rather than copying the entire response. ' +
    'NEVER use JSON.parse() or string manipulation on the response - the data is already structured and ready to use.\n' +
    '\n' +
    'PRESENTING RESULTS TO USERS:\n' +
    'When sharing optimization results, ALWAYS present the route assignments. For each route, show: ' +
    '(1) The vehicle name/ID. ' +
    '(2) The complete ordered list of stops for that vehicle (by location name or service name). Include ALL routes. ' +
    '(3) Key metrics like total distance, number of stops, and all ETAs. ' +
    'Example format: "Vehicle 1 route: Depot (location-0) → Coffee Shop A (location-1) → Coffee Shop B (location-5) → Depot (location-0). Total: 3 stops, 15.2 km." ' +
    '\n' +
    'DISPLAYING ROUTES ON A MAP:\n' +
    'The optimization API returns the SEQUENCE of stops but NOT route geometries (line paths between stops). ' +
    'To draw routes on a map: (1) Extract the ordered stop locations from each route. ' +
    '(2) For each consecutive pair of stops, use a routing/directions API to get the path geometry between them. ' +
    '(3) Combine these geometries to visualize the complete route path. ' +
    'You can display stop markers immediately, but drawing connecting route lines requires additional routing API calls.\n' +
    'When building the map in the final_answer, include all the generated routes in a list like [vehicle1_route, vehicle2_route], and include all the stops as points on the map.' +
    '\n' +
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
    // Validate: If vehicles are provided, at least one service or shipment is required
    if (input.vehicles && input.vehicles.length > 0) {
      const hasServices = input.services && input.services.length > 0;
      const hasShipments = input.shipments && input.shipments.length > 0;

      if (!hasServices && !hasShipments) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  'When vehicles are provided, at least one service or shipment is required'
              })
            }
          ],
          isError: true
        };
      }
    }

    // Convert simplified input to Optimization API v2 format
    // Create locations array with auto-generated names
    const locations = input.coordinates.map((coord, index) => ({
      name: `location-${index}`,
      coordinates: [coord.longitude, coord.latitude] as [number, number]
    }));

    // If vehicles are not provided, create a default vehicle
    let vehicles: Array<unknown>;
    let services: Array<unknown>;
    let shipments: Array<unknown> | undefined;

    if (!input.vehicles || input.vehicles.length === 0) {
      // Simplified mode: auto-generate vehicle and services from coordinates
      vehicles = [
        {
          name: 'vehicle-1',
          routing_profile: input.profile,
          start_location: 'location-0', // Start at first location
          end_location: 'location-0' // Return to first location
        }
      ];

      // Create services for all locations except the first (which is start/end)
      services = input.coordinates.slice(1).map((_, index) => ({
        name: `service-${index + 1}`,
        location: `location-${index + 1}`,
        duration: 0 // No service time by default
      }));
    } else {
      // Advanced mode: use provided vehicles, services, and shipments
      vehicles = input.vehicles;
      services = input.services || [];
      shipments = input.shipments;
    }

    // Build request body
    const requestBody: {
      version: number;
      locations: Array<{ name: string; coordinates: [number, number] }>;
      vehicles: Array<unknown>;
      services: Array<unknown>;
      shipments?: Array<unknown>;
    } = {
      version: 1,
      locations,
      vehicles,
      services
    };

    if (shipments && shipments.length > 0) {
      requestBody.shipments = shipments;
    }

    // Step 1: POST to create optimization job
    const postUrl = `${MapboxApiBasedTool.mapboxApiEndpoint}optimized-trips/v2?access_token=${accessToken}`;

    const postResponse = await this.httpRequest(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      let errorMessage = `Request failed with status ${postResponse.status}: ${postResponse.statusText}`;

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

    const postData = (await postResponse.json()) as {
      id: string;
      status: string;
    };
    const jobId = postData.id;

    // Step 2: Poll GET endpoint for results
    const maxAttempts = input.max_polling_attempts ?? 10;
    const pollingInterval = input.polling_interval_ms ?? 1000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const getUrl = `${MapboxApiBasedTool.mapboxApiEndpoint}optimized-trips/v2/${jobId}?access_token=${accessToken}`;
      const getResponse = await this.httpRequest(getUrl);

      if (!getResponse.ok) {
        if (getResponse.status === 404) {
          return {
            content: [
              {
                type: 'text',
                text: `Optimization job ${jobId} not found`
              }
            ],
            isError: true
          };
        }

        const errorMessage = `Request failed with status ${getResponse.status}: ${getResponse.statusText}`;

        return {
          content: [{ type: 'text', text: errorMessage }],
          isError: true
        };
      }

      // HTTP 200 means the optimization is complete
      if (getResponse.status === 200) {
        const result = (await getResponse.json()) as OptimizationOutput;

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

      // HTTP 202 means still processing, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
      attempts++;
    }

    return {
      content: [
        {
          type: 'text',
          text: `Optimization timed out after ${maxAttempts} attempts. Job ID: ${jobId}. You can check the status later using the job ID.`
        }
      ],
      isError: true
    };
  }
}
