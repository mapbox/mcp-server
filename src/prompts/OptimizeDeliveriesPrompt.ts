// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BasePrompt } from './BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Prompt for optimizing delivery routes using the Optimization API.
 *
 * This prompt guides the agent through:
 * 1. Collecting delivery locations and requirements
 * 2. Starting an optimization task (async operation)
 * 3. Polling for results
 * 4. Presenting the optimized route with ETAs and sequence
 *
 * Example queries:
 * - "Optimize my delivery route for these 10 addresses"
 * - "Find the best order to visit these locations"
 * - "Plan the most efficient route for my deliveries today"
 */
export class OptimizeDeliveriesPrompt extends BasePrompt {
  readonly name = 'optimize-deliveries';
  readonly description =
    'Optimizes delivery routes to minimize travel time and find the best order to visit multiple locations';

  readonly arguments: PromptArgument[] = [
    {
      name: 'locations',
      description:
        'Comma-separated list of addresses or coordinates to optimize',
      required: true
    },
    {
      name: 'mode',
      description:
        'Travel mode: driving, walking, or cycling (default: driving)',
      required: false
    },
    {
      name: 'start',
      description: 'Starting location (defaults to first location in list)',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    const { locations, mode = 'driving', start } = args;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Optimize a ${mode} route for these locations: ${locations}${start ? ` starting from ${start}` : ''}.

Please follow these steps:
1. Geocode all locations to get coordinates (if they're addresses)
2. Use optimization_tool to find the optimal route:
   - Pass coordinates array
   - Set profile to mapbox/${mode}
   - The tool will run as an async task - you'll get a task ID immediately
3. Poll the task until it completes (the tool handles this automatically)
4. Once results are available, display:
   - Optimized sequence of stops (which location to visit in what order)
   - Total distance and estimated travel time
   - Estimated arrival time at each stop
   - Map visualization showing the optimized route
   - Any locations that couldn't be included (dropped items)

IMPORTANT: The optimization_tool is task-based and runs asynchronously. The tool will submit the job and poll for results in the background. Present the results once the task completes.

Format the output to be clear with:
- Numbered list of stops in optimal order
- ETAs at each location
- Total trip statistics`
        }
      }
    ];
  }
}
