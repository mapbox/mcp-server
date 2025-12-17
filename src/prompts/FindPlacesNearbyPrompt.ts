// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for finding places near a location with optional map visualization.
 *
 * This prompt guides the agent through:
 * 1. Geocoding the location (if needed)
 * 2. Searching for places by category
 * 3. Formatting results with map visualization
 *
 * Example queries:
 * - "Find coffee shops near downtown Seattle"
 * - "Show me restaurants near 123 Main St"
 * - "What museums are near the Eiffel Tower?"
 */
export class FindPlacesNearbyPrompt extends BasePrompt {
  readonly name = 'find-places-nearby';
  readonly description =
    'Helps you search for specific types of places near a location with optional map visualization';

  readonly arguments: PromptArgument[] = [
    {
      name: 'location',
      description:
        'The location to search near (address, place name, or coordinates)',
      required: true
    },
    {
      name: 'category',
      description:
        'Type of place to search for (e.g., "coffee shops", "restaurants", "museums")',
      required: false
    },
    {
      name: 'radius',
      description: 'Search radius in meters (default: 1000)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { location, category, radius } = args;
    const radiusText = radius ? ` within ${radius} meters` : '';
    const categoryText = category || 'places';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Find ${categoryText} near ${location}${radiusText}.

Please follow these steps:
1. If the location is not in coordinate format, geocode it first using search_and_geocode_tool
2. Use category_search_tool or search_tool to find ${categoryText} near the location
3. Display the results on a map showing the location and the found places
4. Provide a summary of the top results with key details (name, address, distance)

Make the output clear and actionable.`
        }
      }
    ];
  }
}
