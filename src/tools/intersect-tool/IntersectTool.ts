// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { intersect, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createUIResource } from '@mcp-ui/server';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { IntersectInputSchema } from './IntersectTool.input.schema.js';
import {
  IntersectOutputSchema,
  type IntersectOutput
} from './IntersectTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import { buildPolygonOpsMapPayload } from '../union-tool/buildPolygonOpsMapPayload.js';

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
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/map-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
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
          const content: CallToolResult['content'] = [
            { type: 'text' as const, text }
          ];
          if (isMcpUiEnabled() && mapPayload) {
            const publicToken = process.env.MAPBOX_PUBLIC_TOKEN;
            if (publicToken && publicToken.startsWith('pk.')) {
              const inlineHtml = renderMapAppHtml({
                publicToken,
                initialData: mapPayload
              });
              content.push(
                createUIResource({
                  uri: `ui://mapbox/polygon-ops/${randomUUID()}`,
                  content: { type: 'rawHtml', htmlString: inlineHtml },
                  encoding: 'text',
                  uiMetadata: { 'preferred-frame-size': ['100%', '500px'] }
                })
              );
            }
          }

          const sc: Record<string, unknown> = {
            ...(validated as unknown as Record<string, unknown>)
          };
          if (mapPayload) sc._mapApp = mapPayload;

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          const callResult: CallToolResult = {
            content,
            structuredContent: sc,
            isError: false
          };
          if (mapPayload) callResult._meta = { ui: { payload: mapPayload } };
          return callResult;
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
