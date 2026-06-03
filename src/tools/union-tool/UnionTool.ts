// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { union, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createUIResource } from '@mcp-ui/server';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { UnionInputSchema } from './UnionTool.input.schema.js';
import {
  UnionOutputSchema,
  type UnionOutput
} from './UnionTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import { buildPolygonOpsMapPayload } from './buildPolygonOpsMapPayload.js';

export class UnionTool extends BaseTool<
  typeof UnionInputSchema,
  typeof UnionOutputSchema
> {
  readonly name = 'union_tool';
  readonly description =
    'Merge two or more polygons into a single unified geometry. ' +
    'Useful for combining service areas, delivery zones, isochrones, or coverage regions. ' +
    'Returns a Polygon or MultiPolygon if the inputs do not overlap. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Union Polygons',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/map-app/polygon-ops/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor() {
    super({ inputSchema: UnionInputSchema, outputSchema: UnionOutputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = UnionInputSchema.parse(rawInput);

          const polys = input.polygons.map((rings) => polygon(rings));
          // Union all polygons by passing them as a FeatureCollection
          const merged = union(featureCollection(polys));
          if (!merged) throw new Error('Union operation returned null');

          const output: UnionOutput = {
            geometry: merged.geometry as unknown as Record<string, unknown>,
            type: merged.geometry.type
          };

          const validated = this.validateOutput(output) as UnionOutput;

          const text =
            `Union of ${input.polygons.length} polygons computed.\n` +
            `Result type: ${validated.type}\n` +
            `GeoJSON geometry:\n${JSON.stringify(validated.geometry, null, 2)}`;

          const mapPayload = buildPolygonOpsMapPayload({
            operation: 'union',
            inputs: polys as Array<{ type: 'Feature'; geometry: unknown }>,
            result: merged as { type: 'Feature'; geometry: unknown },
            summary: `Union of ${input.polygons.length} polygons`
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

          const result: CallToolResult = {
            content,
            structuredContent: sc,
            isError: false
          };
          if (mapPayload) result._meta = { ui: { payload: mapPayload } };
          return result;
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
              { type: 'text' as const, text: `UnionTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
