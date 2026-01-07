// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { distance as turfDistance } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { DistanceInputSchema } from './DistanceTool.input.schema.js';
import {
  DistanceOutputSchema,
  type DistanceOutput
} from './DistanceTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * DistanceTool - Calculate distance between two geographic coordinates
 *
 * This is an offline tool that performs local calculations without making API calls.
 * Uses the Haversine formula to calculate great-circle distance on Earth's surface.
 */
export class DistanceTool extends BaseTool<
  typeof DistanceInputSchema,
  typeof DistanceOutputSchema
> {
  readonly name = 'distance_tool';
  readonly description =
    'Calculate the distance between two geographic coordinates. ' +
    'Supports various units including kilometers, miles, meters, feet, and nautical miles. ' +
    'Uses the Haversine formula for accurate great-circle distance calculations. ' +
    'This tool works offline without requiring API calls.';

  readonly annotations = {
    title: 'Calculate Distance',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false // Offline calculation, no external APIs
  };

  constructor() {
    super({
      inputSchema: DistanceInputSchema,
      outputSchema: DistanceOutputSchema
    });
  }

  /**
   * Execute the distance calculation
   * @param rawInput - Input containing from/to coordinates and units
   * @returns CallToolResult with calculated distance
   */
  async run(rawInput: unknown): Promise<CallToolResult> {
    // Create tracing context for this tool
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          // Validate input
          const input = DistanceInputSchema.parse(rawInput);
          const { from, to, units } = input;

          // Calculate distance using Turf.js
          // Turf expects [longitude, latitude]
          const distance = turfDistance(
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
            { units }
          );

          const result: DistanceOutput = {
            distance: Math.round(distance * 1000) / 1000, // Round to 3 decimal places
            units,
            from,
            to
          };

          // Validate output with graceful fallback
          const validatedResult = this.validateOutput(result) as DistanceOutput;

          // Create readable text output
          const text =
            `Distance: ${validatedResult.distance} ${validatedResult.units}\n` +
            `From: [${validatedResult.from.longitude}, ${validatedResult.from.latitude}]\n` +
            `To: [${validatedResult.to.longitude}, ${validatedResult.to.latitude}]`;

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content: [{ type: 'text' as const, text }],
            structuredContent: validatedResult,
            isError: false
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          toolContext.span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage
          });
          toolContext.span.end();
          this.log(
            'error',
            `${this.name}: Error during execution: ${errorMessage}`
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `DistanceTool: Error during execution: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
