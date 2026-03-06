// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { destination, point } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { DestinationInputSchema } from './DestinationTool.input.schema.js';
import {
  DestinationOutputSchema,
  type DestinationOutput
} from './DestinationTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class DestinationTool extends BaseTool<
  typeof DestinationInputSchema,
  typeof DestinationOutputSchema
> {
  readonly name = 'destination_tool';
  readonly description =
    'Calculate a destination point given a starting point, bearing, and distance. ' +
    'Useful for "find a point 5km north of X", constructing search offsets, or computing waypoints. ' +
    'Bearing: 0=north, 90=east, 180/-180=south, -90=west. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Destination',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: DestinationInputSchema,
      outputSchema: DestinationOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = DestinationInputSchema.parse(rawInput);

          const origin = point([input.origin.longitude, input.origin.latitude]);
          const result = destination(origin, input.distance, input.bearing, {
            units: input.units
          });

          const output: DestinationOutput = {
            destination: {
              longitude: result.geometry.coordinates[0],
              latitude: result.geometry.coordinates[1]
            },
            distance: input.distance,
            bearing: input.bearing,
            units: input.units
          };

          const validated = this.validateOutput(output) as DestinationOutput;

          const text =
            `Destination: [${validated.destination.longitude}, ${validated.destination.latitude}]\n` +
            `From: [${input.origin.longitude}, ${input.origin.latitude}]\n` +
            `Distance: ${validated.distance} ${validated.units} at bearing ${validated.bearing}°`;

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
              {
                type: 'text' as const,
                text: `DestinationTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
