// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for cleaning and snapping noisy GPS traces to actual roads.
 *
 * This prompt guides the agent through:
 * 1. Parsing and validating GPS coordinates
 * 2. Using map matching to snap the trace to roads
 * 3. Visualizing before/after comparison
 * 4. Analyzing confidence scores and improvements
 *
 * Example queries:
 * - "Clean up this GPS trace from my bike ride"
 * - "Fix GPS drift in my recorded delivery route"
 * - "Snap this tracking data to actual roads"
 */
export class CleanGpsTracePrompt extends BasePrompt {
  readonly name = 'clean-gps-trace';
  readonly description =
    'Clean and snap noisy GPS traces to actual roads using map matching';

  readonly arguments: PromptArgument[] = [
    {
      name: 'coordinates',
      description:
        'GPS coordinates as array of [longitude, latitude] pairs or JSON string',
      required: true
    },
    {
      name: 'mode',
      description:
        'Travel mode: driving, walking, or cycling (default: driving)',
      required: false
    },
    {
      name: 'timestamps',
      description:
        'Optional Unix timestamps for each coordinate (as JSON array)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { coordinates, mode = 'driving', timestamps } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Clean and snap this GPS trace to actual roads using map matching.

GPS Coordinates: ${coordinates}
Travel Mode: ${mode}${timestamps ? `\nTimestamps: ${timestamps}` : ''}

Please follow these steps:
1. Parse and validate the GPS coordinates (ensure they're in [longitude, latitude] format)
2. Use map_matching_tool with:
   - coordinates: parsed coordinate array
   - profile: mapbox/${mode}
   ${timestamps ? '- timestamps: parsed timestamp array\n   ' : ''}- geometries: geojson (to get the matched route)
   - annotations: true (to get confidence scores)
3. Create a visual comparison showing:
   - Original noisy GPS trace (in red/orange)
   - Cleaned matched route (in blue/green)
   - Confidence scores for the matching
4. Provide a summary including:
   - Number of points processed
   - Average confidence score
   - Distance before and after matching
   - Any segments with low confidence that may need review

Format the output to clearly show the improvements from map matching.`
        }
      }
    ];
  }
}
