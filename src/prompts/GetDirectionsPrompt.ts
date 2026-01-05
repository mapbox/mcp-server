// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for getting turn-by-turn directions between two locations.
 *
 * This prompt guides the agent through:
 * 1. Geocoding start and end locations (if needed)
 * 2. Getting directions via the appropriate routing profile
 * 3. Visualizing the route on a map
 * 4. Providing clear turn-by-turn instructions
 *
 * Example queries:
 * - "Get directions from my office to the airport"
 * - "How do I drive from Seattle to Portland?"
 * - "Walking directions from here to the museum"
 */
export class GetDirectionsPrompt extends BasePrompt {
  readonly name = 'get-directions';
  readonly description =
    'Provides turn-by-turn directions between two locations with options for different travel modes';

  readonly arguments: PromptArgument[] = [
    {
      name: 'from',
      description: 'Starting location (address, place name, or coordinates)',
      required: true
    },
    {
      name: 'to',
      description: 'Destination location (address, place name, or coordinates)',
      required: true
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

    const { from, to, mode = 'driving' } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Get ${mode} directions from ${from} to ${to}.

Please follow these steps:
1. Geocode both the starting point and destination if they're not in coordinate format
2. Use directions_tool to get the route with profile set to ${mode}
3. Display the route on a map with clear start and end markers
4. Provide:
   - Total distance and estimated travel time
   - Turn-by-turn directions (summarized if very long)
   - Any notable features along the route (tolls, ferries, etc.)

Format the output to be clear and easy to follow.`
        }
      }
    ];
  }
}
