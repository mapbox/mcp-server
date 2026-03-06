// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { nearestPointOnLine, point, lineString } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { NearestPointOnLineInputSchema } from './NearestPointOnLineTool.input.schema.js';
import {
  NearestPointOnLineOutputSchema,
  type NearestPointOnLineOutput
} from './NearestPointOnLineTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class NearestPointOnLineTool extends BaseTool<
  typeof NearestPointOnLineInputSchema,
  typeof NearestPointOnLineOutputSchema
> {
  readonly name = 'nearest_point_on_line_tool';
  readonly description =
    'Snap a point to the nearest position on a line or route. ' +
    'Returns the closest point on the line and the distance to it. ' +
    'Useful for "which point on this route is closest to my location?" or map-matching without the API. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Nearest Point on Line',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: NearestPointOnLineInputSchema,
      outputSchema: NearestPointOnLineOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = NearestPointOnLineInputSchema.parse(rawInput);

          const pt = point([input.point.longitude, input.point.latitude]);
          const line = lineString(input.line as [number, number][]);
          const result = nearestPointOnLine(line, pt, { units: input.units });

          const output: NearestPointOnLineOutput = {
            nearest: {
              longitude: result.geometry.coordinates[0],
              latitude: result.geometry.coordinates[1]
            },
            distance: result.properties?.dist ?? 0,
            units: input.units,
            location: result.properties?.location ?? 0
          };

          const validated = this.validateOutput(
            output
          ) as NearestPointOnLineOutput;

          const text =
            `Nearest point on line: [${validated.nearest.longitude}, ${validated.nearest.latitude}]\n` +
            `Distance from input point: ${validated.distance} ${validated.units}\n` +
            `Distance along line: ${validated.location} ${validated.units}`;

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
                text: `NearestPointOnLineTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
