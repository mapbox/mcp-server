// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt } from '../BasePrompt.js';

/**
 * Prompt for getting directions between two locations
 *
 * This prompt helps users get turn-by-turn directions with options for different
 * travel modes and optional map visualization.
 */
export class GetDirectionsPrompt extends BasePrompt<{
  from: z.ZodString;
  to: z.ZodString;
  mode: z.ZodOptional<z.ZodString>;
}> {
  readonly name = 'get-directions';
  readonly title = 'Get Directions';
  readonly description =
    'Get turn-by-turn directions from one location to another with optional travel mode (driving, walking, cycling) and map visualization.';

  constructor() {
    super({
      argsSchema: {
        from: z
          .string()
          .describe('Starting location (address, landmark, or coordinates)'),
        to: z
          .string()
          .describe('Destination location (address, landmark, or coordinates)'),
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
    from: string;
    to: string;
    mode?: string;
  }): Promise<GetPromptResult> {
    const { from, to, mode = 'driving' } = args;

    // Map user-friendly mode to Mapbox profile
    const modeMapping: Record<string, string> = {
      driving: 'driving-traffic',
      walking: 'walking',
      cycling: 'cycling'
    };

    const profile = modeMapping[mode.toLowerCase()] || 'driving-traffic';

    const instructions = `
Please help me get directions from "${from}" to "${to}" by ${mode}:

1. First, use the search_and_geocode tool to geocode both locations:
   - From: "${from}"
   - To: "${to}"

2. Then use the directions tool to get turn-by-turn directions:
   - Profile: ${profile}
   - Include waypoints, distance, duration, and step-by-step instructions

3. Present the directions in a clear format:
   - Total distance and estimated duration
   - Key route information (highways, notable landmarks)
   - Turn-by-turn instructions if detailed navigation is needed

4. Optionally offer to:
   - Create a map visualization showing the route using the static_map_image tool
   - Provide alternative routes if available
   - Show traffic conditions if using driving mode

Additional context:
- Consider current time for traffic estimates (if driving)
- Highlight any tolls, ferries, or special route conditions
- Suggest the fastest or most efficient route
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
