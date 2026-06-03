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
import {
  resolveMapPayloadRef,
  mergeMapPayloads
} from '../../utils/storeMapPayload.js';
import type { HttpRequest } from '../../utils/types.js';

/**
 * `render_map_tool` — the single visualization primitive for Mapbox MCP.
 *
 * Every other Mapbox tool that returns geospatial output stashes a
 * `MapAppPayload` server-side and surfaces a short ref in its
 * `structuredContent._mapApp.ref`. The LLM hands those refs to this tool
 * to display the data on a live Mapbox GL JS map.
 *
 * Two reasons it's a separate tool:
 *   1. MCP App hosts (Claude Desktop today) only fully render the iframe
 *      for the LAST tool in a chained sequence. By funneling all rendering
 *      through one terminal tool we sidestep the chain-position penalty.
 *   2. Server-side refs mean the LLM never has to emit thousands of
 *      coordinate pairs as tool input — keeping latency in the
 *      hundreds-of-millseconds range instead of 20-30s.
 */
export class RenderMapTool extends BaseTool<
  typeof RenderMapInputSchema,
  typeof RenderMapOutputSchema
> {
  readonly name = 'render_map_tool';
  readonly description =
    'Display a live, interactive Mapbox GL JS map. ' +
    'Preferred usage: any other Mapbox tool returns a `_mapApp.ref` URI in ' +
    'its structuredContent — pass that ref via `payload_refs: ["..."]`. ' +
    'You can pass multiple refs to merge several datasets (e.g. a search ' +
    'result + a route) onto one map. ' +
    'Inline `layers`/`markers`/`legend` fields are also supported for ' +
    'hand-composed payloads from raw GeoJSON. ' +
    'Invoke this as the FINAL step whenever a tool returned `_mapApp` data.';

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

          const payload = this.assemblePayload(input);

          if (!payload) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'RenderMapTool: nothing to render. Pass either `payload_refs` or inline `layers`/`markers`.'
                }
              ],
              isError: true
            };
          }

          const layerCount = payload.layers?.length ?? 0;
          const markerCount = payload.markers?.length ?? 0;

          const text =
            `Rendered map with ${layerCount} layer${layerCount === 1 ? '' : 's'}` +
            ` and ${markerCount} marker${markerCount === 1 ? '' : 's'}` +
            (payload.summary ? ` — ${payload.summary}` : '') +
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
              summary: payload.summary,
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

  /**
   * Resolve `payload_refs` and merge with any inline layers/markers/legend.
   * Inline `summary` (when set) overrides any summary from the refs.
   * Returns null if nothing renderable is provided.
   */
  private assemblePayload(input: RenderMapInput): MapAppPayload | null {
    const fromRefs: MapAppPayload[] = [];
    if (Array.isArray(input.payload_refs)) {
      for (const ref of input.payload_refs) {
        const resolved = resolveMapPayloadRef(ref);
        if (resolved) fromRefs.push(resolved);
      }
    }

    const inline: MapAppPayload = {
      // RenderMapInput's `data: z.unknown()` widens layer geometry beyond
      // MapAppPayload's strict Geometry union, so cast to assemble the
      // payload object that flows to the iframe renderer.
      layers: (input.layers ?? []) as MapAppPayload['layers'],
      markers: input.markers as MapAppPayload['markers'],
      legend: input.legend,
      camera: input.camera as MapAppPayload['camera'],
      summary: input.summary
    };
    const hasInlineContent =
      (inline.layers && inline.layers.length > 0) ||
      (inline.markers && inline.markers.length > 0);

    const all: MapAppPayload[] = [...fromRefs];
    if (hasInlineContent || inline.summary || inline.legend) all.push(inline);
    if (all.length === 0) return null;

    const merged = mergeMapPayloads(all);
    // Inline summary/camera/legend take precedence when provided.
    if (input.summary) merged.summary = input.summary;
    if (input.camera) merged.camera = inline.camera;
    if (input.legend) merged.legend = input.legend;
    return merged;
  }
}

export type { RenderMapInput };
