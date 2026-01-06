// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for cleaning and snapping GPS traces to road networks.
 *
 * This prompt guides the agent through:
 * 1. Processing raw GPS coordinates
 * 2. Snapping them to the road network using Map Matching
 * 3. Returning a clean, accurate route
 *
 * Example queries:
 * - "Clean up this noisy GPS trace"
 * - "Snap these GPS points to roads"
 * - "Match my recorded GPS track to the road network"
 */
export class CleanGpsTracePrompt extends BasePrompt {
  readonly name = 'clean-gps-trace';
  readonly description =
    'Cleans noisy GPS traces by snapping them to the road network and returning an accurate route';

  readonly arguments: PromptArgument[] = [
    {
      name: 'coordinates',
      description:
        'GPS trace as coordinates in format "lng1,lat1;lng2,lat2;..." or as an array',
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
        'Optional Unix timestamps for each coordinate (comma-separated)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { coordinates, mode = 'driving', timestamps } = args;

    const timestampNote = timestamps
      ? '\n   - Include the provided timestamps to improve matching accuracy'
      : '';

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Clean this GPS trace and snap it to the road network: ${coordinates}

Please follow these steps:
1. Parse the GPS coordinates (convert to proper coordinate format if needed)
2. Use map_matching_tool to snap the trace to roads:
   - Pass the coordinates array in order they were recorded
   - Set profile to ${mode}${timestampNote}
   - Request annotations for distance, duration, and speed if available
3. Display:
   - Map visualization showing:
     * Original GPS points (in one color)
     * Matched route on roads (in another color)
   - Statistics:
     * Total matched distance
     * Total duration
     * Confidence score (if available)
     * Number of points matched vs original
   - Any anomalies or gaps in the trace

The map_matching_tool will:
- Snap noisy GPS coordinates to the nearest roads
- Fill in gaps where GPS signal was lost
- Return a clean route that follows the actual road network

Format the output clearly showing before/after comparison and route quality metrics.`
        }
      }
    ];
  }
}
