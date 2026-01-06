// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for optimizing multi-stop routes with time windows and constraints.
 *
 * This prompt guides the agent through:
 * 1. Geocoding addresses (if needed)
 * 2. Setting up optimization constraints
 * 3. Running the optimization API
 * 4. Visualizing the optimized route
 * 5. Showing time and distance savings
 *
 * Example queries:
 * - "Optimize my delivery route for these 10 addresses"
 * - "What's the best order to visit these locations?"
 * - "Plan a multi-stop trip with time constraints"
 */
export class OptimizeDeliveriesPrompt extends BasePrompt {
  readonly name = 'optimize-deliveries';
  readonly description =
    'Find the optimal route for multiple stops with optional time windows and capacity constraints';

  readonly arguments: PromptArgument[] = [
    {
      name: 'stops',
      description:
        'List of stops as addresses or coordinates (comma-separated or JSON array)',
      required: true
    },
    {
      name: 'profile',
      description:
        'Routing profile: driving, driving-traffic, cycling, or walking (default: driving-traffic)',
      required: false
    },
    {
      name: 'start_location',
      description: 'Optional starting location (if different from first stop)',
      required: false
    },
    {
      name: 'end_location',
      description: 'Optional ending location (if different from last stop)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const {
      stops,
      profile = 'driving-traffic',
      start_location,
      end_location
    } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Optimize the route for multiple stops to find the most efficient order.

Stops: ${stops}
Profile: ${profile}${start_location ? `\nStart Location: ${start_location}` : ''}${end_location ? `\nEnd Location: ${end_location}` : ''}

Please follow these steps:
1. Parse the stops list (handle both address strings and coordinates)
2. Geocode any addresses to get coordinates (use search_and_geocode_tool)
3. Prepare the optimization request:
   - Convert stops to shipments format (each stop is a delivery)
   - Set source=first and destination=last (or use specified start/end locations)
   - Use profile: mapbox/${profile}
4. Call optimization_tool with the shipment configuration
5. Display the results:
   - Show the optimized route on a map with numbered waypoints
   - Provide the optimized order of stops
   - Show total distance and estimated time
   - Compare against the original order (if applicable):
     * Time saved
     * Distance saved
     * Efficiency gain percentage
6. Provide turn-by-turn summary for the optimized route

Format the output to clearly show the optimization benefits and the recommended stop order.

Note: The Optimization API is asynchronous, so the tool will poll for results. This may take a few seconds.`
        }
      }
    ];
  }
}
