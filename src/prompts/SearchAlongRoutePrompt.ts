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
   - Extract the route LineString coordinates from the response (it will be an array of [lon, lat] pairs)
   - Note the total route distance in meters

3. **Create search corridor and find places** (choose approach based on route length):

   **For SHORT routes (< 50km):** [RECOMMENDED - Most accurate]
   - Use buffer_tool on the route LineString coordinates with distance=${buffer_meters} meters
     * Pass the coordinates as: {"geometry": [[lon1,lat1], [lon2,lat2], ...], "distance": ${buffer_meters}, "units": "meters"}
   - The buffer result will be a Polygon
   - Use bounding_box_tool on the buffer polygon to get search bbox
     * Pass the polygon coordinates from the buffer result
   - Use category_search_tool with the bbox parameter (format: "minLon,minLat,maxLon,maxLat")
   - Use point_in_polygon_tool to filter results to the buffer corridor
   - This gives precise corridor filtering

   **For MEDIUM routes (50-150km):** [PRAGMATIC - Balanced]
   - Use bounding_box_tool on the route LineString coordinates to get the route's bbox
     * Pass the route coordinates as: {"geometry": [[lon1,lat1], [lon2,lat2], ...]}
   - Use category_search_tool with the bbox parameter (format: "minLon,minLat,maxLon,maxLat")
   - Filter results by calculating distance to the closest route point (use distance_tool)
   - Keep only results within ${buffer_meters}m of the route
   - Note to user: "For this medium-length route, results are filtered to the general corridor"

   **For VERY LONG routes (> 150km):** [SAMPLING - Most practical]
   - Sample 5-7 strategic points evenly spaced along the route
     * Extract coordinates at indices: 0, len/6, 2*len/6, 3*len/6, 4*len/6, 5*len/6, len-1
   - For each sample point coordinate [lon, lat]:
     * Use category_search_tool with proximity parameter: "lon,lat" and limit results
   - Combine results from all sample points (remove duplicates if any)
   - Order by distance from start point
   - Note to user: "Due to the route length (X km), showing results near major points along the route rather than the full corridor"

   **Why this three-tier approach:**
   - Short routes: Full precision
   - Medium routes: Balanced filtering
   - Very long routes: Strategic sampling prevents token/timeout issues

4. **Order and present results**:
   - Use distance_tool to calculate each POI's distance from the start point
   - Order results by distance from start (approximate route progress)
   - For short routes with precise corridor: results should all be on/near route
   - For long routes with bbox filtering: results are approximate corridor

5. **Visualize and present**:

   **Map generation (conditional based on route length):**
   - For SHORT routes (<50km): Generate a detailed map with static_map_image_tool
     * Use simplify_tool first to reduce route coordinates (tolerance=0.001)
     * Show the simplified route as a path overlay
     * Add start and end markers
     * Add found location markers (top 10)

   - For MEDIUM routes (50-150km): Generate a simplified map
     * Use simplify_tool with higher tolerance (0.01) to drastically reduce points
     * Show simplified route, start/end markers, top 5-8 location markers

   - For VERY LONG routes (>150km): Skip map generation
     * Note: "Map visualization skipped for route length - see results list below"
     * Focus on the text list of results instead
     * This avoids slow encoding of complex routes

   **Results list (always provide):**
   - Name and address of each place
   - Distance from start of route (e.g., "45 miles into your trip")
   - Distance from route line (e.g., "0.3 miles off route")
   - Total results found

6. **Additional context**:
   - Mention the total route distance and estimated travel time
   - Note which approach was used:
     * Short route: "Using precise corridor filtering"
     * Medium route: "Filtered to general route corridor"
     * Very long route: "Showing results near major points along the route"
   - If no results were found, suggest widening the search corridor or checking different locations
   - If many results (>15), show top 15 and mention there are more

**Important notes:**
- Routes < 50km: Use precise corridor filtering (buffer + point-in-polygon)
- Routes 50-150km: Use bbox filtering with distance checks
- Routes > 150km: Use strategic point sampling (5-7 points) to avoid token/timeout issues
- These thresholds keep the workflow practical and reliable for all route lengths
- Always inform the user which approach was used and set appropriate expectations

Make the output clear, actionable, and well-formatted.`
        }
      }
    ];
  }
}
