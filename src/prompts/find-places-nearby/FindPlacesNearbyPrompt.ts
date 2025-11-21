// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { BasePrompt } from '../BasePrompt.js';

/**
 * Prompt for finding places nearby a location
 *
 * This prompt helps users search for specific types of places (restaurants, hotels, etc.)
 * near a given location.
 */
export class FindPlacesNearbyPrompt extends BasePrompt<{
  location: z.ZodString;
  category: z.ZodOptional<z.ZodString>;
}> {
  readonly name = 'find-places-nearby';
  readonly title = 'Find Places Nearby';
  readonly description =
    'Find specific types of places (restaurants, hotels, gas stations, etc.) near a location. Optionally visualize results on a map.';

  constructor() {
    super({
      argsSchema: {
        location: z
          .string()
          .describe(
            'The location to search near (address, landmark, or coordinates)'
          ),
        category: z
          .string()
          .optional()
          .describe(
            'Optional: Type of place to find (e.g., "restaurant", "hotel", "gas_station", "coffee")'
          )
      }
    });
  }

  async run(args: {
    location: string;
    category?: string;
  }): Promise<GetPromptResult> {
    const { location, category } = args;

    // Add detailed instructions for the AI
    const instructions = `
Please help me find places near this location:

1. First, use the search_and_geocode tool to get the coordinates for "${location}"
${category ? `2. Then use the category_search tool to find ${category}s near those coordinates` : '2. Then use the category_search tool to search for relevant places near those coordinates'}
3. Present the results in a clear, organized format including:
   - Name and address of each place
   - Distance from the search location
   - Any relevant details (ratings, descriptions, etc.)
4. Optionally, offer to create a map visualization showing the location and found places using the static_map_image tool

${!category ? "\nNote: Since no specific category was provided, you may want to ask what type of places I'm looking for, or show popular categories like restaurants, hotels, or attractions." : ''}
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
