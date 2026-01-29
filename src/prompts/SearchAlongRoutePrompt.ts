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
   - Choose the appropriate search tool:
     * If "${search_for}" is a specific place/brand (e.g., "Starbucks", "McDonald's", "Whole Foods"):
       Use search_and_geocode_tool with proximity="lon,lat" and q="${search_for}"
     * If "${search_for}" is a category (e.g., "coffee shops", "gas stations", "restaurants"):
       Use category_search_tool with types="${search_for}" and proximity="lon,lat"
   - Limit results per point (10-20 for short routes, 5-10 for long routes)

   **IMPORTANT - Execute searches in parallel:**
   - All sample point searches are INDEPENDENT and can run concurrently
   - Make ALL search tool calls in a single message (parallel execution)
   - Example: If you have 5 sample points, make 5 search_and_geocode_tool calls in one turn
   - This dramatically speeds up the workflow vs sequential searches

   **Combine and deduplicate:**
   - Collect all results from sample points
   - Remove duplicates (same place found from multiple sample points)
   - Calculate distances from start point using distance_tool:
     * These calculations are INDEPENDENT and can run in parallel
     * Make ALL distance_tool calls in a single message for all results
     * Example: If you have 10 unique results, make 10 distance_tool calls in one turn
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

5. **Present results**:

   **Skip map generation by default** (static_map_image_tool encoding is slow):
   - Note to user: "Map visualization can be generated separately if needed"
   - The client (Claude Desktop, etc.) may have its own map display capabilities
   - Focus on providing excellent text results instead

   **Results list (always provide):**
   - Summary: "Found X results along the route from ${from} to ${to}"
   - Route details: Total distance and estimated travel time
   - For each result:
     * Name and address
     * Approximate distance from start (e.g., "45 miles into your trip")
     * Coordinates (so user could map them separately if desired)
   - Total results found
   - Note which sampling strategy was used

   **If user explicitly asks for a map:**
   - Only then use static_map_image_tool with route and top 8-10 results
   - Warn that encoding may take time for longer routes

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
