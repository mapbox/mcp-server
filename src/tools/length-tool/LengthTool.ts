// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { length as turfLength, lineString } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { LengthInputSchema } from './LengthTool.input.schema.js';
import {
  LengthOutputSchema,
  type LengthOutput
} from './LengthTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class LengthTool extends BaseTool<
  typeof LengthInputSchema,
  typeof LengthOutputSchema
> {
  readonly name = 'length_tool';
  readonly description =
    'Measure the total length of a line defined by a series of coordinates. ' +
    'Useful for measuring a drawn route, path, or boundary without a routing API call. ' +
    'Supports kilometers, miles, meters, and feet. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Measure Line Length',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({ inputSchema: LengthInputSchema, outputSchema: LengthOutputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = LengthInputSchema.parse(rawInput);

          const line = lineString(input.coordinates as [number, number][]);
          const len = turfLength(line, { units: input.units });

          const output: LengthOutput = {
            length: Math.round(len * 1000) / 1000,
            units: input.units,
            num_coordinates: input.coordinates.length
          };

          const validated = this.validateOutput(output) as LengthOutput;

          const text =
            `Length: ${validated.length} ${validated.units}\n` +
            `Coordinates: ${validated.num_coordinates} points`;

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content: [{ type: 'text' as const, text }],
            structuredContent: validated,
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
          return {
            content: [
              { type: 'text' as const, text: `LengthTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
