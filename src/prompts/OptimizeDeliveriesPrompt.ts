// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for optimizing delivery routes using the Optimization API v1.
 *
 * This prompt guides the agent through:
 * 1. Geocoding delivery locations (if needed)
 * 2. Using optimization_tool to find optimal route (2-12 locations)
 * 3. Presenting the optimized waypoint sequence with trip statistics
 *
 * Example queries:
 * - "Optimize my delivery route for these addresses"
 * - "Find the best order to visit these locations"
 * - "Plan the most efficient route for my deliveries today"
 *
 * Note: Limited to 12 coordinates per request (Optimization API v1 constraint)
 */
export class OptimizeDeliveriesPrompt extends BasePrompt {
  readonly name = 'optimize-deliveries';
  readonly description =
    'Optimizes delivery routes to minimize travel time and find the best order to visit multiple locations';

  readonly arguments: PromptArgument[] = [
    {
      name: 'locations',
      description:
        'Comma-separated list of addresses or coordinates to optimize',
      required: true
    },
    {
      name: 'mode',
      description:
        'Travel mode: driving, walking, or cycling (default: driving)',
      required: false
    },
    {
      name: 'start',
      description: 'Starting location (defaults to first location in list)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { locations, mode = 'driving', start } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Optimize a ${mode} route for these locations: ${locations}${start ? ` starting from ${start}` : ''}.

Please follow these steps:
1. Geocode all locations to get coordinates (if they're addresses)
   - IMPORTANT: The Optimization API v1 supports 2-12 coordinates maximum
   - If you have more than 12 locations, inform the user and ask which locations to prioritize

2. Use optimization_tool to find the optimal route:
   - Pass coordinates array (2-12 coordinates)
   - Set profile to mapbox/${mode}
   - Optionally set geometries to "geojson" for map visualization
   - Consider using roundtrip:false for one-way trips
   - The tool returns results immediately (synchronous)

3. Display the optimized route:
   - Show the waypoints in optimal visiting order (use waypoint_index to show original positions)
   - Total distance (from trips[0].distance) and duration (from trips[0].duration)
   - Map visualization if geometry was requested
   - Individual leg details if relevant

Format the output to be clear with:
- Numbered list of stops in optimal order (e.g., "1. Stop 3 (original position 2) → 2. Stop 1 (original position 0)")
- Total trip statistics (distance in km, duration in minutes)
- Map showing the complete route if geometry is available`
        }
      }
    ];
  }
}
