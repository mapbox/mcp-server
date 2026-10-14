// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from '../../utils/mapAppPayload.js';
import {
  resolveMapPayloadRef,
  mergeMapPayloads
} from '../../utils/storeMapPayload.js';
import { isComputeRef, resolveComputeRef } from '../../utils/computeRef.js';
import {
  isSelfFetchRef,
  resolveSelfFetchRef
} from '../../utils/selfFetchRef.js';
import {
  isInlinePayloadRef,
  resolveInlinePayloadRef
} from '../../utils/inlinePayloadRef.js';
import type { RenderMapInput } from './RenderMapTool.input.schema.js';

/**
 * Resolve `payload_refs` and merge with any inline layers/markers/legend.
 * Inline `summary` (when set) overrides any summary from the refs.
 * `payload` is null if nothing renderable is provided. `unresolvedRefs`
 * lists any input refs that failed to resolve (expired/unknown/wrong
 * owner) so the caller can tell the LLM data may be missing or stale,
 * rather than silently dropping it.
 */
export function assembleMapPayload(
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
    summary: input.summary,
    baseMapConfig: input.baseMapConfig,
    baseStyle: input.baseStyle
  };
  const hasInlineContent =
    (inline.layers && inline.layers.length > 0) ||
    (inline.markers && inline.markers.length > 0);

  const all: MapAppPayload[] = [...fromRefs];
  // baseMapConfig/baseStyle-only calls (e.g. "now turn the water red" or
  // "switch to satellite" with no new data) are renderable on their own —
  // treated like summary/legend.
  if (
    hasInlineContent ||
    inline.summary ||
    inline.legend ||
    inline.baseMapConfig ||
    inline.baseStyle
  )
    all.push(inline);
  if (all.length === 0) return { payload: null, unresolvedRefs };

  const merged = mergeMapPayloads(all);
  // Inline summary/camera/legend/baseMapConfig/baseStyle take precedence when provided.
  if (input.summary) merged.summary = input.summary;
  if (input.camera) merged.camera = inline.camera;
  if (input.legend) merged.legend = input.legend;
  if (input.baseMapConfig) merged.baseMapConfig = input.baseMapConfig;
  if (input.baseStyle) merged.baseStyle = input.baseStyle;
  return { payload: merged, unresolvedRefs };
}
