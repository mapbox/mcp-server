// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { bearing as turfBearing } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { BearingInputSchema } from './BearingTool.input.schema.js';
import {
  BearingOutputSchema,
  type BearingOutput
} from './BearingTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * BearingTool - Calculate the bearing between two geographic coordinates
 */
export class BearingTool extends BaseTool<
  typeof BearingInputSchema,
  typeof BearingOutputSchema
> {
  readonly name = 'bearing_tool';
  readonly description =
    'Calculate the bearing (compass direction) from one point to another. ' +
    'Returns bearing in degrees where 0° is North, 90° is East, 180° is South, and 270° is West. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Bearing',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: BearingInputSchema,
      outputSchema: BearingOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = BearingInputSchema.parse(rawInput);
          const { from, to } = input;

          const bearing = turfBearing(
            [from.longitude, from.latitude],
            [to.longitude, to.latitude]
          );

          // Convert from -180 to 180 range to 0-360 range
          const normalizedBearing = bearing < 0 ? bearing + 360 : bearing;

          const result: BearingOutput = {
            bearing: Math.round(normalizedBearing * 100) / 100,
            from,
            to
          };

          const validatedResult = this.validateOutput(result) as BearingOutput;

          const text =
            `Bearing: ${validatedResult.bearing}° ` +
            `(${this.bearingToCardinal(validatedResult.bearing)})\n` +
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
          this.log('error', `${this.name}: ${errorMessage}`);
          return {
            content: [
              { type: 'text' as const, text: `BearingTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }

  private bearingToCardinal(bearing: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }
}
