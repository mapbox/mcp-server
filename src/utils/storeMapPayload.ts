// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { temporaryResourceManager } from './temporaryResourceManager.js';
import type { MapAppPayload } from './mapAppPayload.js';

// Above this size, only the ref is included inline (the ref+resources/read
// path still works for hosts that support it) - matches the 50KB threshold
// already used elsewhere (e.g. the directions/isochrone large-response
// stash) for the same "don't bloat the response" reasoning.
const MAX_INLINE_PAYLOAD_BYTES = 50 * 1024;

/**
 * Schema for the `mapboxRender` field that data tools attach to their
 * structuredContent. Each tool declares this on its output schema so
 * Claude Desktop (and any other host that strictly validates tool results
 * against the published output schema) doesn't flag the response.
 */
export const MapAppRefSchema = z
  .object({
    ref: z
      .string()
      .describe(
        'Server-side payload reference. Pass to `render_map_tool` via `payload_refs: ["<this ref>"]` to display the data on a live Mapbox GL JS map.'
      )
  })
  .describe(
    'Map-payload reference for `render_map_tool`. Surfaced so the LLM can chain the next call without re-emitting geometry.'
  );

export type MapAppRef = z.infer<typeof MapAppRefSchema>;

const TEMP_URI_PREFIX = 'mapbox://temp/map-payload-';

/**
 * Stash a `MapAppPayload` server-side and return a short reference the LLM
 * can pass to `render_map_tool` instead of inlining the whole payload as
 * tool-call arguments. With detailed geometry (a directions polyline can
 * easily be 5–50 KB), having the LLM emit the payload token-by-token costs
 * 20–30 seconds per render and risks Anthropic API timeouts on big
 * payloads (e.g. polygon-op chains). Passing a ref instead keeps the LLM's
 * emission down to a few tokens.
 *
 * `owner` must be the same account identifier (`getUserNameFromToken`) the
 * caller resolves for its own token — `TemporaryDataResource.read()` fails
 * closed on an unowned resource, so omitting this makes the ref permanently
 * unreadable via the real `resources/read` path the render iframe uses (it
 * always 404s), even though callers that read the manager directly (like
 * `resolveMapPayloadRef`) wouldn't notice anything wrong.
 */
export function storeMapPayload(
  payload: MapAppPayload,
  owner?: string
): string {
  const id = randomUUID();
  const uri = `${TEMP_URI_PREFIX}${id}`;
  // 30-minute TTL is the temporaryResourceManager default — same as the
  // directions/isochrone large-response stash, so the lifetime story is
  // consistent across uses.
  temporaryResourceManager.create({
    id,
    uri,
    data: payload,
    owner,
    metadata: { toolName: 'map-payload' }
  });
  return uri;
}

/**
 * Build the `mapboxRender` field for `render_map_tool`'s own structuredContent
 * - the one tool result the iframe actually reads. Includes the resolved
 * payload inline (in addition to `ref`) when it's small enough, because
 * ChatGPT's MCP Apps bridge delivers `structuredContent` to the iframe intact
 * but has no `resources/read` equivalent at all - the ref alone is
 * permanently unusable there. Claude Desktop strips `structuredContent`
 * before it reaches the iframe, so it's unaffected either way and keeps
 * using the ref (via the sentinel-tagged text) + `resources/read`.
 *
 * Only `render_map_tool` needs this: it's the only tool that declares
 * `_meta.ui.resourceUri`, so it's the only tool result the iframe ever sees.
 */
export function buildMapboxRenderField(
  ref: string,
  payload: MapAppPayload
): { ref: string } & Partial<MapAppPayload> {
  const byteSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (byteSize > MAX_INLINE_PAYLOAD_BYTES) {
    return { ref };
  }
  return { ref, ...payload };
}

/**
 * One-line render hint that data tools append to their text output. Tells the
 * LLM the EXACT shape of the next call so it doesn't hallucinate a ref URI.
 * (Seen in the wild: Sonnet inventing `mapbox-isochrone-tool-result://0` when
 * only structuredContent.mapboxRender.ref had the real `mapbox://temp/map-payload-…`
 * URI — including the literal string in the visible text fixes that.)
 */
export function renderHint(ref: string): string {
  return (
    `\n\n📍 To show this on a live Mapbox GL JS map, call:\n` +
    `   render_map_tool({ "payload_refs": ["${ref}"] })`
  );
}

/**
 * Resolve a `mapbox://temp/map-payload-...` ref back to its `MapAppPayload`.
 * Returns null if the ref is unknown, expired, or owned by a different
 * account than `owner` — this is the same account-scoping enforced by
 * `TemporaryDataResource.read()` (a caller passing another account's ref
 * would otherwise have it silently merged and re-served under their own
 * ref, bypassing the read-side check entirely since this goes straight to
 * the manager rather than through `resources/read`).
 */
export function resolveMapPayloadRef(
  ref: string,
  owner: string | undefined
): MapAppPayload | null {
  if (!ref.startsWith(TEMP_URI_PREFIX)) return null;
  const entry = temporaryResourceManager.get(ref);
  if (!entry || !entry.data) return null;
  if (!entry.owner || !owner || entry.owner !== owner) return null;
  return entry.data as MapAppPayload;
}

/**
 * Merge multiple `MapAppPayload`s into one. Layer/marker IDs are
 * deduplicated by appending an index suffix when collisions happen.
 * Summaries are joined with " · ". Legends are concatenated.
 */
export function mergeMapPayloads(payloads: MapAppPayload[]): MapAppPayload {
  const seenLayerIds = new Set<string>();
  const layers: MapAppPayload['layers'] = [];
  const markers: NonNullable<MapAppPayload['markers']> = [];
  const legend: NonNullable<MapAppPayload['legend']> = [];
  const summaries: string[] = [];

  payloads.forEach((p, payloadIdx) => {
    if (p.summary) summaries.push(p.summary);
    if (Array.isArray(p.layers)) {
      for (const layer of p.layers) {
        let id = layer.id;
        if (seenLayerIds.has(id)) id = `${layer.id}-${payloadIdx}`;
        seenLayerIds.add(id);
        layers.push({ ...layer, id });
      }
    }
    if (Array.isArray(p.markers)) markers.push(...p.markers);
    if (Array.isArray(p.legend)) legend.push(...p.legend);
  });

  return {
    summary: summaries.length > 0 ? summaries.join(' · ') : undefined,
    layers,
    markers: markers.length > 0 ? markers : undefined,
    legend: legend.length > 0 ? legend : undefined
  };
}
