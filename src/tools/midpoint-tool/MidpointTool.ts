// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { midpoint as turfMidpoint, point } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { MidpointInputSchema } from './MidpointTool.input.schema.js';
import {
  MidpointOutputSchema,
  type MidpointOutput
} from './MidpointTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * MidpointTool - Calculate the geographic midpoint between two coordinates
 */
export class MidpointTool extends BaseTool<
  typeof MidpointInputSchema,
  typeof MidpointOutputSchema
> {
  readonly name = 'midpoint_tool';
  readonly description =
    'Calculate the geographic midpoint between two coordinates. ' +
    'Returns the point that is halfway between the two input points along the great circle path. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Midpoint',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: MidpointInputSchema,
      outputSchema: MidpointOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = MidpointInputSchema.parse(rawInput);
          const { from, to } = input;

          const pt1 = point([from.longitude, from.latitude]);
          const pt2 = point([to.longitude, to.latitude]);
          const mid = turfMidpoint(pt1, pt2);

          const result: MidpointOutput = {
            midpoint: {
              longitude:
                Math.round(mid.geometry.coordinates[0] * 1000000) / 1000000,
              latitude:
                Math.round(mid.geometry.coordinates[1] * 1000000) / 1000000
            },
            from,
            to
          };

          const validatedResult = this.validateOutput(result) as MidpointOutput;

          const text =
            `Midpoint: [${validatedResult.midpoint.longitude}, ${validatedResult.midpoint.latitude}]\n` +
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
              { type: 'text' as const, text: `MidpointTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
