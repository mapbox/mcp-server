// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for finding places along a route between two locations.
 *
 * This prompt guides the agent through:
 * 1. Geocoding start and end locations (if needed)
 * 2. Getting the route geometry
 * 3. Creating a buffer corridor around the route
 * 4. Searching for places within that corridor
 * 5. Filtering and ordering results by distance from route
 * 6. Visualizing on a map
 *
 * Example queries:
 * - "I want to go from Seattle to Portland, is there a Starbucks along the way?"
 * - "Find gas stations along my route from LA to San Francisco"
 * - "Show me rest stops between Denver and Salt Lake City"
 * - "What restaurants are along the drive from Boston to NYC?"
 */
export class SearchAlongRoutePrompt extends BasePrompt {
  readonly name = 'search-along-route';
  readonly description =
    'Finds specific types of places along a route between two locations, using buffer analysis and POI search';

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
      name: 'search_for',
      description:
        'Type of place to search for (e.g., "Starbucks", "gas stations", "rest stops", "restaurants")',
      required: true
    },
    {
      name: 'mode',
      description:
        'Travel mode: driving, walking, or cycling (default: driving)',
      required: false
    },
    {
      name: 'buffer_meters',
      description:
        'Search corridor width on each side of route in meters (default: 1000)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const {
      from,
      to,
      search_for,
      mode = 'driving',
      buffer_meters = '1000'
    } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Find ${search_for} along the ${mode} route from ${from} to ${to}.

Please follow these steps:

1. **Geocode locations** (if needed):
   - Use search_and_geocode_tool to convert ${from} and ${to} to coordinates if they're not already in coordinate format

2. **Get the route**:
   - Use directions_tool with profile=${mode} to get the route geometry between the two points
   - Extract the route LineString geometry from the response

3. **Create search corridor**:
   - Use buffer_tool on the route geometry with distance=${buffer_meters} meters
   - This creates a polygon corridor around the route

4. **Search for places**:
   - Use category_search_tool or search_and_geocode_tool to find "${search_for}"
   - Use the buffer polygon's bounding box as the search area
   - Consider searching in segments if the route is very long (>100km)

5. **Filter results**:
   - Use point_in_polygon_tool to confirm each result is actually within the buffer corridor
   - Use distance_tool to calculate distance from each POI to the route
   - Order results by their position along the route (use bearing or route progress)

6. **Visualize and present**:
   - Display a map showing:
     * The route line
     * Start and end markers
     * All found locations as markers
     * Optionally, the buffer corridor (semi-transparent)
   - Provide a list of results including:
     * Name and address of each place
     * Distance from route
     * Approximate position along route (e.g., "15 miles into your trip")
     * Total results found

7. **Additional context**:
   - Mention the total route distance and estimated travel time
   - Note if no results were found and suggest widening the search corridor
   - If many results (>20), show top 10-15 and mention there are more

Tips:
- For long routes, you may need to search in multiple segments
- Adjust buffer_meters if too many/few results (wider for highways, narrower for city streets)
- Consider the travel mode when setting buffer defaults (walking=500m, driving=1000m)

Make the output clear, actionable, and well-formatted.`
        }
      }
    ];
  }
}
