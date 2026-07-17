// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { intersect, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { IntersectInputSchema } from './IntersectTool.input.schema.js';
import {
  IntersectOutputSchema,
  type IntersectOutput
} from './IntersectTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildPolygonOpsMapPayload } from '../union-tool/buildPolygonOpsMapPayload.js';
import { storeMapPayload, renderHint } from '../../utils/storeMapPayload.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';

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

  async run(
    rawInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    const accessToken =
      extra?.authInfo?.token || process.env.MAPBOX_ACCESS_TOKEN;
    const owner = accessToken ? getUserNameFromToken(accessToken) : undefined;
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

          const mapPayload = buildPolygonOpsMapPayload({
            operation: 'intersect',
            inputs: [poly1, poly2] as Array<{
              type: 'Feature';
              geometry: unknown;
            }>,
            result: (result ?? null) as {
              type: 'Feature';
              geometry: unknown;
            } | null,
            summary: validated.intersects
              ? 'Intersection of two polygons'
              : 'Polygons do not intersect'
          });
          const sc: Record<string, unknown> = {
            ...(validated as unknown as Record<string, unknown>)
          };
          let textOut = text;
          if (mapPayload) {
            const ref = storeMapPayload(mapPayload, owner);
            sc.mapboxRender = { ref };
            textOut += renderHint(ref);
          }

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
