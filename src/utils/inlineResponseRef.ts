// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

const INLINE_RESPONSE_URI_PREFIX = 'mapbox://inline-response/';

/** Tools whose full response can be carried by an inline-response ref. */
const INLINE_RESPONSE_TOOLS = ['directions', 'isochrone'] as const;
export type InlineResponseTool = (typeof INLINE_RESPONSE_TOOLS)[number];

/**
 * Build a ref carrying a tool's own full (pre-truncation) response data,
 * self-describing rather than backed by server-side storage.
 *
 * Why this exists: the hosted deployment runs multiple stateless ECS tasks
 * behind a load balancer with no session stickiness — every `POST /mcp`
 * can land on a different task, and each task's `McpServer` instance is
 * freshly created per request. A large-response fallback that stashes data
 * in an in-process `Map` (see the now-unused-by-these-two-tools
 * `temporaryResourceManager.ts`) only exists on the one task that happened
 * to handle the original call; a `resources/read` for that ref on any other
 * task returns "not found", indistinguishable from the ref being stale or
 * from Directions "still computing" (it isn't — Directions is synchronous
 * and has already finished by the time the ref is returned).
 *
 * A ref that carries the data itself has no such problem: resolving it is
 * a pure decode of the URI, identical on every task, with no store, no TTL,
 * and no ownership check to get wrong — the same tradeoff already accepted
 * by `mapbox://inline/`, `mapbox://selffetch/`, and `mapbox://compute/`
 * refs elsewhere in this codebase. Whoever holds the ref can decode it, but
 * it's only ever handed back to the same caller who made the original
 * request, exactly like those other ref types.
 */
export function buildInlineResponseRef(
  tool: InlineResponseTool,
  data: unknown
): string {
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString(
    'base64url'
  );
  return `${INLINE_RESPONSE_URI_PREFIX}${tool}?data=${encoded}`;
}

export function isInlineResponseRef(uri: string): boolean {
  return uri.startsWith(INLINE_RESPONSE_URI_PREFIX);
}

/**
 * Unwrap a `mapbox://inline-response/...` ref back into the data it
 * carries. Returns null if the ref isn't this scheme, names an
 * unrecognized tool, or its data doesn't decode.
 */
export function resolveInlineResponseRef<T = unknown>(uri: string): T | null {
  if (!isInlineResponseRef(uri)) return null;

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
  if (!INLINE_RESPONSE_TOOLS.includes(tool as InlineResponseTool)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
