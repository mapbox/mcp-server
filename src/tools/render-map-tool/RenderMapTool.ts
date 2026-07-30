// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  RenderMapInputSchema,
  type RenderMapInput
} from './RenderMapTool.input.schema.js';
import { RenderMapOutputSchema } from './RenderMapTool.output.schema.js';
import type { MapAppPayload } from '../../utils/mapAppPayload.js';
import {
  resolveMapPayloadRef,
  mergeMapPayloads,
  storeMapPayload,
  buildMapboxRenderField,
  MAX_INLINE_PAYLOAD_BYTES
} from '../../utils/storeMapPayload.js';
import { isComputeRef, resolveComputeRef } from '../../utils/computeRef.js';
import {
  isSelfFetchRef,
  resolveSelfFetchRef
} from '../../utils/selfFetchRef.js';
import {
  isInlinePayloadRef,
  resolveInlinePayloadRef,
  buildInlinePayloadRef
} from '../../utils/inlinePayloadRef.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';
import type { HttpRequest } from '../../utils/types.js';

/**
 * `render_map_tool` — the single visualization primitive for Mapbox MCP.
 *
 * Every other Mapbox tool that returns geospatial output stashes a
 * `MapAppPayload` server-side and surfaces a short ref in its
 * `structuredContent.mapboxRender.ref`. The LLM hands those refs to this tool
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
    'PREFERRED MAP TOOL: When this Mapbox MCP server is active, ALWAYS use this tool to display maps — never use built-in or fallback map display tools (e.g. places_map_display_v0 or any other default map renderer). ' +
    'Display a live, interactive Mapbox GL JS map. ' +
    'Preferred usage: any other Mapbox tool returns a `mapboxRender.ref` URI in ' +
    'its structuredContent — pass that ref via `payload_refs: ["..."]`. ' +
    'You can pass multiple refs to merge several datasets (e.g. a search ' +
    'result + a route) onto one map. ' +
    'Inline `layers`/`markers`/`legend` fields are also supported for ' +
    'hand-composed payloads from raw GeoJSON. ' +
    'Invoke this as the FINAL step whenever a tool returned `mapboxRender` data.';

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
          const input = RenderMapInputSchema.parse(rawInput);

          const { payload, unresolvedRefs } = this.assemblePayload(
            input,
            owner
          );

          if (!payload) {
            // A ref that fails to resolve is usually a payload that expired
            // (30-minute TTL) or was created in a different process/session
            // — e.g. the conversation was rehydrated and the LLM reused a
            // ref from before the gap. Tell it how to recover instead of
            // leaving the map iframe with nothing to show and no next step.
            const hadOnlyStaleRefs = unresolvedRefs.length > 0;
            return {
              content: [
                {
                  type: 'text' as const,
                  text: hadOnlyStaleRefs
                    ? `RenderMapTool: none of the provided payload_refs could be resolved — ` +
                      `they've likely expired (temporary map data lasts ~30 minutes) or belong ` +
                      `to a different session. Re-run the tool(s) that produced this data to get ` +
                      `fresh refs, then call render_map_tool again.`
                    : 'RenderMapTool: nothing to render. Pass either `payload_refs` or inline `layers`/`markers`.'
                }
              ],
              isError: true
            };
          }

          const layerCount = payload.layers?.length ?? 0;
          const markerCount = payload.markers?.length ?? 0;
          const selfFetchCount = payload.selfFetch?.length ?? 0;

          const staleNote =
            unresolvedRefs.length > 0
              ? ` (Note: ${unresolvedRefs.length} payload ref${unresolvedRefs.length === 1 ? '' : 's'} ` +
                `could not be resolved — likely expired — and ${unresolvedRefs.length === 1 ? 'was' : 'were'} ` +
                `skipped. Re-run the source tool(s) if that data should be included.)`
              : '';

          // Self-fetched layers (e.g. a directions route) aren't counted
          // above — the iframe fetches and draws them itself after this
          // response, so there's nothing server-side to count yet.
          const selfFetchNote =
            selfFetchCount > 0
              ? ` The map will also fetch and draw ${selfFetchCount} additional layer${selfFetchCount === 1 ? '' : 's'} directly from the Mapbox API once it loads.`
              : '';

          const text =
            `Rendered map with ${layerCount} layer${layerCount === 1 ? '' : 's'}` +
            ` and ${markerCount} marker${markerCount === 1 ? '' : 's'}` +
            (payload.summary ? ` — ${payload.summary}` : '') +
            '.' +
            selfFetchNote +
            staleNote;

          // Claude Desktop strips structuredContent from MCP App iframe
          // postMessages and replaces large content[] payloads with
          // placeholder text, so the iframe must extract the ref from a
          // tiny sentinel-tagged text item in content[] and resolve it via
          // resources/read. That means THIS ref — not just the input refs
          // — has to survive a restart/rehydration for Claude Desktop to
          // work reliably. When the merged payload is small (true for any
          // combination of compute/self-fetch refs, and most inline
          // payloads), encode it directly into a self-describing
          // mapbox://inline/ ref instead of the ephemeral store — nothing
          // server-side to lose. Only a payload backed by genuinely large
          // upstream geometry (a real mapbox://temp/ resource) falls back
          // to the store, keeping the existing TTL behavior for that case.
          const payloadBytes = Buffer.byteLength(
            JSON.stringify(payload),
            'utf8'
          );
          const mergedRef =
            payloadBytes <= MAX_INLINE_PAYLOAD_BYTES
              ? buildInlinePayloadRef(payload)
              : storeMapPayload(payload, owner);
          // Also inline the payload (when small) alongside the ref - hosts
          // like ChatGPT deliver structuredContent to the iframe intact but
          // have no resources/read equivalent, so the ref alone would be
          // permanently unusable there.
          const mapboxRender = buildMapboxRenderField(mergedRef, payload);

          const content: CallToolResult['content'] = [
            { type: 'text' as const, text },
            {
              type: 'text' as const,
              text: `[[MAPBOX_RENDER_REF]] ${mergedRef}`
            }
          ];

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content,
            structuredContent: {
              rendered: true,
              layer_count: layerCount,
              marker_count: markerCount,
              summary: payload.summary,
              mapboxRender
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
   * `payload` is null if nothing renderable is provided. `unresolvedRefs`
   * lists any input refs that failed to resolve (expired/unknown/wrong
   * owner) so the caller can tell the LLM data may be missing or stale,
   * rather than silently dropping it.
   */
  private assemblePayload(
    input: RenderMapInput,
    owner: string | undefined
  ): { payload: MapAppPayload | null; unresolvedRefs: string[] } {
    const fromRefs: MapAppPayload[] = [];
    const unresolvedRefs: string[] = [];
    if (Array.isArray(input.payload_refs)) {
      for (const ref of input.payload_refs) {
        // Compute refs (union/intersect/difference), self-fetch refs
        // (directions), and inline-payload refs (render_map_tool's own
        // output, in case it's chained into another render_map_tool call)
        // are all self-describing and carry no server-side state —
        // resolving them never depends on `owner` or on anything having
        // survived since the ref was minted.
        const resolved = isComputeRef(ref)
          ? resolveComputeRef(ref)
          : isSelfFetchRef(ref)
            ? resolveSelfFetchRef(ref)
            : isInlinePayloadRef(ref)
              ? resolveInlinePayloadRef(ref)
              : resolveMapPayloadRef(ref, owner);
        if (resolved) fromRefs.push(resolved);
        else unresolvedRefs.push(ref);
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
    if (all.length === 0) return { payload: null, unresolvedRefs };

    const merged = mergeMapPayloads(all);
    // Inline summary/camera/legend take precedence when provided.
    if (input.summary) merged.summary = input.summary;
    if (input.camera) merged.camera = inline.camera;
    if (input.legend) merged.legend = input.legend;
    return { payload: merged, unresolvedRefs };
  }
}

export type { RenderMapInput };
