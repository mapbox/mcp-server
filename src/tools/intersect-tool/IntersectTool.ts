// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { intersect, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { IntersectInputSchema } from './IntersectTool.input.schema.js';
import {
  IntersectOutputSchema,
  type IntersectOutput
} from './IntersectTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class IntersectTool extends BaseTool<
  typeof IntersectInputSchema,
  typeof IntersectOutputSchema
> {
  readonly name = 'intersect_tool';
  readonly description =
    'Find the intersection geometry of two polygons — the area they share in common. ' +
    'Useful for coverage overlap analysis, finding shared service areas, or zone overlap. ' +
    'Returns null geometry if the polygons do not overlap. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Intersect Polygons',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: IntersectInputSchema,
      outputSchema: IntersectOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = IntersectInputSchema.parse(rawInput);

          const poly1 = polygon(input.polygon1);
          const poly2 = polygon(input.polygon2);
          const result = intersect(featureCollection([poly1, poly2]));

          const output: IntersectOutput = {
            intersects: result !== null,
            geometry: result
              ? (result.geometry as unknown as Record<string, unknown>)
              : null
          };

          const validated = this.validateOutput(output) as IntersectOutput;

          const text = validated.intersects
            ? `The polygons intersect.\nIntersection geometry:\n${JSON.stringify(validated.geometry, null, 2)}`
            : 'The polygons do not intersect.';

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
              { type: 'text' as const, text: `IntersectTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
