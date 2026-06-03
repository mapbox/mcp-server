// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createUIResource } from '@mcp-ui/server';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  RenderMapInputSchema,
  type RenderMapInput
} from './RenderMapTool.input.schema.js';
import { RenderMapOutputSchema } from './RenderMapTool.output.schema.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import type { MapAppPayload } from '../../utils/mapAppPayload.js';
import type { HttpRequest } from '../../utils/types.js';

/**
 * `render_map_tool` — the single visualization primitive for Mapbox MCP.
 *
 * Every other Mapbox tool that has geospatial output (directions, isochrone,
 * optimization, search, map-matching, ground-location, polygon-ops) returns
 * a ready-to-render `_mapApp` payload as part of its structuredContent.
 * The LLM passes that payload (or composes its own) to this tool to display
 * a live Mapbox GL JS map.
 *
 * Why this lives in its own tool rather than being attached to each data
 * tool: MCP App hosts (Claude Desktop today) only fully render the iframe
 * for the LAST tool in a chained sequence. By funneling all rendering
 * through one terminal tool we sidestep that chain-position penalty —
 * `render_map_tool` is always last by design.
 */
export class RenderMapTool extends BaseTool<
  typeof RenderMapInputSchema,
  typeof RenderMapOutputSchema
> {
  readonly name = 'render_map_tool';
  readonly description =
    'Display a live, interactive Mapbox GL JS map. ' +
    'Call this AFTER gathering geospatial data with any other Mapbox tool — ' +
    "pass the `_mapApp` field from that tool's structuredContent as the input. " +
    'You can also compose a payload yourself from raw GeoJSON (layers + markers + legend + summary). ' +
    'The user expects to see a map for any spatial query (routes, isochrones, POI searches, polygon operations, etc.), ' +
    'so invoke this as the final step whenever a tool returned `_mapApp` data.';

  readonly annotations = {
    title: 'Render Map',
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

  private readonly httpRequest: HttpRequest;
  private readonly apiEndpoint: () => string;

  constructor(params: {
    httpRequest: HttpRequest;
    apiEndpoint?: () => string;
  }) {
    super({
      inputSchema: RenderMapInputSchema,
      outputSchema: RenderMapOutputSchema
    });
    this.httpRequest = params.httpRequest;
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = RenderMapInputSchema.parse(rawInput);
          // RenderMapInput's `data: z.unknown()` widens layer geometry beyond
          // MapAppPayload's strict Geometry union, so cast to assemble the
          // payload object that flows to the iframe renderer.
          const payload = input as unknown as MapAppPayload;

          const layerCount = input.layers?.length ?? 0;
          const markerCount = input.markers?.length ?? 0;

          const text =
            `Rendered map with ${layerCount} layer${layerCount === 1 ? '' : 's'}` +
            ` and ${markerCount} marker${markerCount === 1 ? '' : 's'}` +
            (input.summary ? ` — ${input.summary}` : '') +
            '.';

          const content: CallToolResult['content'] = [
            { type: 'text' as const, text }
          ];

          // Inline MCP-UI fallback for hosts that don't speak the MCP Apps
          // spec. The iframe HTML is identical to what MapAppUIResource
          // serves; only the delivery channel differs.
          if (isMcpUiEnabled()) {
            const accessToken = process.env.MAPBOX_ACCESS_TOKEN ?? '';
            const publicToken = await resolveMapboxPublicToken({
              accessToken,
              apiEndpoint: this.apiEndpoint(),
              httpRequest: this.httpRequest
            });
            if (publicToken) {
              const inlineHtml = renderMapAppHtml({
                publicToken,
                initialData: payload
              });
              content.push(
                createUIResource({
                  uri: `ui://mapbox/map-app/${randomUUID()}`,
                  content: { type: 'rawHtml', htmlString: inlineHtml },
                  encoding: 'text',
                  uiMetadata: { 'preferred-frame-size': ['100%', '500px'] }
                })
              );
            }
          }

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          // structuredContent._mapApp lets MCP App hosts (and any iframe
          // listening on this tool's tool-result) extract the payload.
          return {
            content,
            structuredContent: {
              rendered: true,
              layer_count: layerCount,
              marker_count: markerCount,
              summary: input.summary,
              _mapApp: payload as unknown as Record<string, unknown>
            },
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
                text: `RenderMapTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}

export type { RenderMapInput };
