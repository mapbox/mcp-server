// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for visualizing areas reachable within a specified time from a location.
 *
 * This prompt guides the agent through:
 * 1. Geocoding the starting location (if needed)
 * 2. Calculating isochrones for the specified travel time
 * 3. Visualizing the reachable areas on a map
 * 4. Providing context about what the isochrone represents
 *
 * Example queries:
 * - "Show me areas I can reach in 15 minutes from downtown"
 * - "What's the 30-minute driving range from our warehouse?"
 * - "Display my 10-minute walk radius from home"
 */
export class ShowReachableAreasPrompt extends BasePrompt {
  readonly name = 'show-reachable-areas';
  readonly description =
    'Visualizes areas that can be reached from a location within a specified time using isochrones';

  readonly arguments: PromptArgument[] = [
    {
      name: 'location',
      description: 'Starting location (address, place name, or coordinates)',
      required: true
    },
    {
      name: 'time_minutes',
      description: 'Travel time in minutes (default: 15)',
      required: false
    },
    {
      name: 'mode',
      description:
        'Travel mode: driving, walking, or cycling (default: driving)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { location, time_minutes = '15', mode = 'driving' } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Show areas reachable within ${time_minutes} minutes of ${mode} from ${location}.

Please follow these steps:
1. Geocode the location if it's not in coordinate format
2. Use isochrone_tool to calculate the ${time_minutes}-minute ${mode} isochrone
3. Visualize the reachable area on a map with:
   - The starting location clearly marked
   - The isochrone polygon showing the reachable area
   - Appropriate styling to make it easy to understand
4. Provide context explaining:
   - What area is covered (approximate square miles/km)
   - What this means practically (e.g., "You can reach X locations within ${time_minutes} minutes")
   - Any limitations or caveats (traffic conditions, time of day, etc.)

Make the visualization clear and the explanation actionable.`
        }
      }
    ];
  }
}
