// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { temporaryResourceManager } from './temporaryResourceManager.js';
import type { MapAppPayload } from './mapAppPayload.js';

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
 */
export function storeMapPayload(payload: MapAppPayload): string {
  const id = randomUUID();
  const uri = `${TEMP_URI_PREFIX}${id}`;
  // 30-minute TTL is the temporaryResourceManager default — same as the
  // directions/isochrone large-response stash, so the lifetime story is
  // consistent across uses.
  temporaryResourceManager.create(id, uri, payload, {
    toolName: 'map-payload'
  });
  return uri;
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
 * Returns null if the ref is unknown or expired.
 */
export function resolveMapPayloadRef(ref: string): MapAppPayload | null {
  if (!ref.startsWith(TEMP_URI_PREFIX)) return null;
  const entry = temporaryResourceManager.get(ref);
  if (!entry || !entry.data) return null;
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
