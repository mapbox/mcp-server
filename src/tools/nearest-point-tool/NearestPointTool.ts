// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { nearestPoint, point, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { NearestPointInputSchema } from './NearestPointTool.input.schema.js';
import {
  NearestPointOutputSchema,
  type NearestPointOutput
} from './NearestPointTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class NearestPointTool extends BaseTool<
  typeof NearestPointInputSchema,
  typeof NearestPointOutputSchema
> {
  readonly name = 'nearest_point_tool';
  readonly description =
    'Find the nearest point in a collection to a given target point. ' +
    'More efficient than calling distance_tool for each candidate and sorting. ' +
    'Useful for finding the closest store, stop, or landmark to a location. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Nearest Point',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: NearestPointInputSchema,
      outputSchema: NearestPointOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = NearestPointInputSchema.parse(rawInput);

          const targetPt = point([
            input.target.longitude,
            input.target.latitude
          ]);
          const candidates = featureCollection(
            input.points.map((p) => point([p.longitude, p.latitude]))
          );

          const nearest = nearestPoint(targetPt, candidates, {
            units: input.units
          });

          const output: NearestPointOutput = {
            nearest: {
              longitude: nearest.geometry.coordinates[0],
              latitude: nearest.geometry.coordinates[1]
            },
            distance: nearest.properties?.distanceToPoint ?? 0,
            units: input.units,
            index: nearest.properties?.featureIndex ?? 0
          };

          const validated = this.validateOutput(output) as NearestPointOutput;

          const text =
            `Nearest point: [${validated.nearest.longitude}, ${validated.nearest.latitude}]\n` +
            `Distance: ${validated.distance} ${validated.units}\n` +
            `Index in input array: ${validated.index}`;

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
                text: `NearestPointTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
