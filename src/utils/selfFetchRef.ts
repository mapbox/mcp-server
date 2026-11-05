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
  'category_search',
  'optimization',
  'ground_location'
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

/**
 * The proximity params for a search self-fetch. When the call gave neither
 * `proximity` nor `bbox`, the Search Box API biases toward the caller's IP:
 * the server's own call and the iframe's re-fetch come from different
 * places on a hosted server, so the map showed cafés near the user's
 * browser (New Jersey) while the reply described the server's results (San
 * Francisco). Pinning the re-fetch to the first point result keeps the map
 * on the results the model saw. `proximityFromResults` tells the iframe
 * that this point isn't a search center, so it draws no center pin and
 * shows no distances.
 */
export function searchSelfFetchProximity(
  input: {
    proximity?: { longitude: number; latitude: number };
    bbox?: unknown;
  },
  data: unknown
): {
  proximity?: { longitude: number; latitude: number };
  proximityFromResults?: true;
} {
  if (input.proximity || input.bbox) return { proximity: input.proximity };
  const features = (data as { features?: unknown } | null | undefined)
    ?.features;
  if (!Array.isArray(features)) return {};
  for (const f of features as Array<{
    geometry?: { type?: string; coordinates?: unknown };
  }>) {
    const c = f?.geometry?.coordinates;
    if (
      f?.geometry?.type === 'Point' &&
      Array.isArray(c) &&
      typeof c[0] === 'number' &&
      typeof c[1] === 'number'
    ) {
      return {
        proximity: { longitude: c[0], latitude: c[1] },
        proximityFromResults: true
      };
    }
  }
  return {};
}

function isNonEmptyNumberArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

/**
 * Reject refs whose params can't produce a valid API request in the iframe.
 * A ref minted by the tool itself always passes, but the ref format is easy
 * for an LLM to hand-write, and a malformed one would otherwise resolve
 * here, report success to the LLM, and only fail later inside the iframe
 * (e.g. `contours_minutes: 15` instead of `[15]` is silently dropped from
 * the Isochrone request, which then 422s with "You must supply one of
 * contours_meters or contours_minutes"). Failing here routes the ref into
 * render_map_tool's unresolved-refs path, which tells the LLM to re-run
 * the source tool.
 */
function hasValidSelfFetchParams(
  tool: SelfFetchTool,
  params: Record<string, unknown>
): boolean {
  if (tool === 'isochrone') {
    const coords = params.coordinates as
      | { longitude?: unknown; latitude?: unknown }
      | undefined;
    if (
      !coords ||
      typeof coords.longitude !== 'number' ||
      typeof coords.latitude !== 'number'
    ) {
      return false;
    }
    return (
      isNonEmptyNumberArray(params.contours_minutes) ||
      isNonEmptyNumberArray(params.contours_meters)
    );
  }
  return true;
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
  if (!hasValidSelfFetchParams(tool as SelfFetchTool, params)) return null;

  return {
    layers: [],
    selfFetch: [{ tool: tool as SelfFetchTool, params }]
  };
}
