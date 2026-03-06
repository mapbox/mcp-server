// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { convex, featureCollection, point } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { ConvexInputSchema } from './ConvexTool.input.schema.js';
import {
  ConvexOutputSchema,
  type ConvexOutput
} from './ConvexTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class ConvexTool extends BaseTool<
  typeof ConvexInputSchema,
  typeof ConvexOutputSchema
> {
  readonly name = 'convex_tool';
  readonly description =
    'Compute the convex hull of a set of points — the smallest convex polygon that contains all the points. ' +
    'Useful for bounding area analysis, estimating coverage area, or wrapping a set of locations. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Convex Hull',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({ inputSchema: ConvexInputSchema, outputSchema: ConvexOutputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = ConvexInputSchema.parse(rawInput);

          const pts = featureCollection(
            input.points.map((p) => point([p.longitude, p.latitude]))
          );
          const hull = convex(pts);

          const output: ConvexOutput = {
            geometry: hull
              ? (hull.geometry as unknown as Record<string, unknown>)
              : null,
            num_points: input.points.length
          };

          const validated = this.validateOutput(output) as ConvexOutput;

          const text = validated.geometry
            ? `Convex hull computed from ${validated.num_points} points.\nGeometry:\n${JSON.stringify(validated.geometry, null, 2)}`
            : `Could not compute convex hull from ${validated.num_points} points (points may be collinear).`;

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
              { type: 'text' as const, text: `ConvexTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
