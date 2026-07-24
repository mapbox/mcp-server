// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from './mapAppPayload.js';

const INLINE_PAYLOAD_URI_PREFIX = 'mapbox://inline/payload?data=';

/**
 * Self-describing counterpart to `storeMapPayload` for `render_map_tool`'s
 * own merged output. The whole resolved payload is base64'd directly into
 * the ref — no server-side store, no TTL, no owner.
 *
 * Why this exists: `render_map_tool` used to *always* call `storeMapPayload`
 * for its merged output, even when every input was already a self-
 * describing `mapbox://compute/...` or `mapbox://selffetch/...` ref (see
 * computeRef.ts / selfFetchRef.ts). That meant Claude Desktop — which
 * strips `structuredContent` and depends entirely on `resources/read`
 * against the sentinel-embedded ref — was still vulnerable to the exact
 * restart/rehydration bug those refs were built to eliminate, because the
 * *final* hop (render_map_tool's own ref) was still ephemeral regardless of
 * how the inputs got there. ChatGPT was unaffected (it reads the payload
 * straight out of `structuredContent`, never touching the ref), which is
 * why the gap wasn't obvious from that side.
 *
 * Only used when the merged payload is small enough to inline (see
 * `MAX_INLINE_PAYLOAD_BYTES` in storeMapPayload.ts) — a payload backed by a
 * genuinely large upstream `mapbox://temp/...` resource still needs the
 * real store and keeps the existing TTL behavior.
 */
export function buildInlinePayloadRef(payload: MapAppPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  return `${INLINE_PAYLOAD_URI_PREFIX}${data}`;
}

export function isInlinePayloadRef(uri: string): boolean {
  return uri.startsWith(INLINE_PAYLOAD_URI_PREFIX);
}

/**
 * Unwrap a `mapbox://inline/payload?data=...` ref back into its
 * `MapAppPayload`. Returns null if the ref isn't this scheme or its data
 * doesn't decode.
 */
export function resolveInlinePayloadRef(uri: string): MapAppPayload | null {
  if (!isInlinePayloadRef(uri)) return null;
  const encoded = uri.slice(INLINE_PAYLOAD_URI_PREFIX.length);
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
