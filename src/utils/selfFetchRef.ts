// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload, MapAppSelfFetch } from './mapAppPayload.js';

const SELF_FETCH_URI_PREFIX = 'mapbox://selffetch/';

export type SelfFetchTool = MapAppSelfFetch['tool'];

const SELF_FETCH_TOOLS: readonly SelfFetchTool[] = [
  'directions',
  'isochrone',
  'map_matching',
  'search',
  'category_search'
];

/**
 * Build a ref for a tool whose map preview is fetched by the iframe itself,
 * directly from the Mapbox API using its own public token — rather than
 * server-computed geometry stashed behind an opaque UUID.
 *
 * `params` is the tool's own call arguments (already visible to the LLM —
 * nothing new is exposed), base64'd into the URI. Unlike `mapbox://temp/`
 * refs, there is nothing server-side to lose on a restart: resolving this
 * ref just unwraps the params back into a `MapAppPayload.selfFetch` entry
 * for the iframe to act on, with no I/O and no store involved.
 */
export function buildSelfFetchRef(
  tool: SelfFetchTool,
  params: Record<string, unknown>
): string {
  const data = Buffer.from(JSON.stringify(params), 'utf8').toString(
    'base64url'
  );
  return `${SELF_FETCH_URI_PREFIX}${tool}?data=${data}`;
}

export function isSelfFetchRef(uri: string): boolean {
  return uri.startsWith(SELF_FETCH_URI_PREFIX);
}

/**
 * Unwrap a `mapbox://selffetch/...` ref back into a minimal `MapAppPayload`
 * carrying only a `selfFetch` entry — no layers/markers of its own. The
 * iframe resolves the actual geometry client-side after the initial render
 * (see the `selffetch` handling in `mapAppHtml.ts`). Returns null if the ref
 * isn't a self-fetch ref, names an unrecognized tool, or its data doesn't
 * decode.
 */
export function resolveSelfFetchRef(uri: string): MapAppPayload | null {
  if (!isSelfFetchRef(uri)) return null;

  let tool: string;
  let encoded: string | null;
  try {
    const parsed = new URL(uri);
    tool = parsed.pathname.replace(/^\//, '');
    encoded = parsed.searchParams.get('data');
  } catch {
    return null;
  }
  if (!encoded) return null;
  if (!SELF_FETCH_TOOLS.includes(tool as SelfFetchTool)) return null;

  let params: Record<string, unknown>;
  try {
    params = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!params || typeof params !== 'object') return null;

  return {
    layers: [],
    selfFetch: [{ tool: tool as SelfFetchTool, params }]
  };
}
