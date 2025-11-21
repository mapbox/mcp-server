// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt } from '../BasePrompt.js';

/**
 * Prompt for showing areas reachable within a time or distance constraint
 *
 * This prompt helps users visualize isochrones - areas that can be reached
 * within a specified time or distance from a location.
 */
export class ShowReachableAreasPrompt extends BasePrompt<{
  location: z.ZodString;
  time_minutes: z.ZodOptional<z.ZodString>;
  mode: z.ZodOptional<z.ZodString>;
}> {
  readonly name = 'show-reachable-areas';
  readonly title = 'Show Reachable Areas';
  readonly description =
    'Visualize areas that can be reached from a location within a specified time or distance, using driving, walking, or cycling.';

  constructor() {
    super({
      argsSchema: {
        location: z
          .string()
          .describe('Starting location (address, landmark, or coordinates)'),
        time_minutes: z
          .string()
          .optional()
          .describe(
            'Travel time in minutes (e.g., "15", "30", "45"). Can specify multiple comma-separated values.'
          ),
        mode: z
          .string()
          .optional()
          .describe(
            'Travel mode: "driving", "walking", or "cycling" (default: driving)'
          )
      }
    });
  }

  async run(args: {
    location: string;
    time_minutes?: string;
    mode?: string;
  }): Promise<GetPromptResult> {
    const { location, time_minutes = '15', mode = 'driving' } = args;

    // Map user-friendly mode to Mapbox profile
    const modeMapping: Record<string, string> = {
      driving: 'driving',
      walking: 'walking',
      cycling: 'cycling'
    };

    const profile = modeMapping[mode.toLowerCase()] || 'driving';

    const instructions = `
Please help me visualize areas reachable from "${location}" within ${time_minutes} minutes by ${mode}:

1. First, use the search_and_geocode tool to get coordinates for "${location}"

2. Then use the isochrone tool to generate reachable areas:
   - Profile: ${profile}
   - Time contours: ${time_minutes} minutes
   - This will create isochrone polygons showing areas reachable within the specified time

3. Present the results including:
   - A clear description of the reachable area(s)
   - GeoJSON data for the isochrone(s)
   - Explanation of what the isochrone represents

4. Optionally offer to:
   - Create a map visualization using the static_map_image tool with the isochrone overlaid
   - Compare multiple time windows (e.g., 15, 30, 45 minutes)
   - Find specific places within the reachable area

Context:
- Isochrones are useful for understanding accessibility and planning
- They can help answer questions like "Can I reach this place in 30 minutes?"
- Different travel modes produce very different reachable areas
${profile === 'driving' ? '- Consider traffic conditions for driving routes' : ''}
`.trim();

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instructions
          }
        }
      ]
    };
  }
}
