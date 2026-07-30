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
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildComputeRef } from '../../utils/computeRef.js';

export class IntersectTool extends BaseTool<
  typeof IntersectInputSchema,
  typeof IntersectOutputSchema
> {
  readonly name = 'intersect_tool';
  readonly description =
    'Find the intersection geometry of two polygons — the area they share in common. ' +
    'Useful for coverage overlap analysis, finding shared service areas, or zone overlap. ' +
    'Returns null geometry if the polygons do not overlap. ' +
    'Works offline without API calls. ' +
    'INPUT SHAPE: `polygon1` and `polygon2` are each an array of rings; each ring is an array of [lng, lat] pairs. ' +
    'When chaining with isochrone_tool, extract `feature.geometry.coordinates` from each isochrone Feature (with `polygons=true`).';

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

          // Intersect is a pure function of its inputs — the ref carries
          // the inputs themselves rather than a pointer to a server-side
          // store. See computeRef.ts.
          const ref = buildComputeRef('intersect', [
            { type: 'Feature' as const, geometry: poly1.geometry },
            { type: 'Feature' as const, geometry: poly2.geometry }
          ]);
          const sc: Record<string, unknown> = {
            ...(validated as unknown as Record<string, unknown>),
            mapboxRender: { ref }
          };
          const textOut = text + renderHint(ref);

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content: [{ type: 'text' as const, text: textOut }],
            structuredContent: sc,
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
