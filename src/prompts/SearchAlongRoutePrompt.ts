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
      mode = 'driving'
      // buffer_meters parameter is kept for API compatibility but not used
      // in the simplified proximity-sampling approach
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
   - Extract the route LineString coordinates from the response (it will be an array of [lon, lat] pairs)
   - Note the total route distance

3. **Search along the route using point sampling** (works for all route lengths):

   **Determine sample strategy based on route length:**
   - SHORT routes (< 50km): Sample every 5-10 points along the route (more samples for better coverage)
   - MEDIUM routes (50-150km): Sample every 15-20 points along the route
   - VERY LONG routes (> 150km): Sample 5-7 evenly spaced points (start, end, and middle points)

   **For each sample point:**
   - Extract the coordinate [lon, lat] from the route
   - Use category_search_tool with:
     * query: "${search_for}"
     * proximity: "lon,lat" (bias results near this point)
     * limit: Keep results reasonable (10-20 per point for short routes, 5-10 for long routes)

   **Combine and deduplicate:**
   - Collect all results from sample points
   - Remove duplicates (same place found from multiple sample points)
   - Use distance_tool to calculate each result's distance from the start point
   - Order results by distance from start (approximate route progress)

   **Why this approach works:**
   - Simple and reliable - just directions + proximity searches
   - No buffer/bbox/polygon complexity
   - Works consistently for all route lengths
   - Fast execution, no token issues
   - Covers the route corridor naturally through proximity searches

4. **Present results**:
   - Results are already ordered by distance from start
   - Limit to top 15 results if many were found
   - Note: Results are biased to the route corridor through proximity searches at sample points

5. **Visualize and present**:

   **Map generation:**
   - For routes < 150km: Use static_map_image_tool to create a map
     * Show the route as a path overlay (pass the route geometry directly)
     * Add start and end markers
     * Add found location markers (top 8-10 only to keep map clean)
   - For routes ≥ 150km: Skip map to avoid slow rendering
     * Note to user: "Map skipped due to route length - see results list"

   **Results list (always provide):**
   - Name and address of each place
   - Approximate distance from start of route (e.g., "45 miles into your trip")
   - Total results found
   - Note which sampling strategy was used

6. **Additional context**:
   - Mention the total route distance and estimated travel time
   - Note which sampling strategy was used:
     * Short route: "Searched every 5-10 points along the route for comprehensive coverage"
     * Medium route: "Sampled key points along the route"
     * Very long route: "Sampled major points along the route"
   - If no results were found, suggest trying a different search term or checking a specific segment
   - If many results (>15), show top 15 and mention there are more

**Important notes:**
- This approach uses simple proximity searches at sampled route points
- No buffer/bbox/polygon operations needed - much more reliable
- Works consistently for all route lengths
- Fast and avoids token/timeout issues
- Results naturally cover the route corridor through proximity biasing

Make the output clear, actionable, and well-formatted.`
        }
      }
    ];
  }
}
