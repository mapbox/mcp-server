// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

const INLINE_IMAGE_URI_PREFIX = 'mapbox://inline-image/';

const INLINE_IMAGE_TOOLS = ['static-map'] as const;
export type InlineImageTool = (typeof INLINE_IMAGE_TOOLS)[number];

export interface InlineImageRef {
  tool: InlineImageTool;
  params: Record<string, unknown>;
}

/**
 * Self-describing ref for `static_map_image_tool`'s large-image fallback.
 * Same motivation as `inlineResponseRef.ts` (the old `mapbox://temp/` ref
 * was backed by an in-process `Map`, which the hosted deployment's multiple
 * stateless ECS tasks don't share), but a different mechanism: this embeds
 * only the original *request params*, not the image bytes.
 *
 * The Static Images API is a deterministic renderer of
 * (style, center, zoom, size, overlays) — re-issuing the same request always
 * reproduces the same image byte-for-byte — so there's nothing to gain by
 * storing or transmitting the output at all. That's also a hard requirement,
 * not just an optimization: embedding raw bytes the way `inlineResponseRef`
 * does for JSON works there because those responses are at most a few
 * hundred KB, but this tool's fallback only triggers above 700KB, and a
 * single-pass base64 encoding of an image that size alone already produces
 * a URI over the MCP SDK's hard 1,000,000-character resource-URI cap —
 * confirmed live (a 750KB image encoded to a 1,024,055-character URI and
 * the SDK rejected the read). Images can run into multiple megabytes (e.g.
 * 1280x1280 @2x), so there's no realistic threshold below which encoding
 * the bytes directly would be safe. Re-fetching the (tiny) params instead
 * of storing the (large) output sidesteps the size limit entirely, at the
 * cost of one extra Static Images API call per follow-up read — see
 * `InlineImageResource.read()`, which performs that re-fetch.
 */
export function buildInlineImageRef(
  tool: InlineImageTool,
  params: Record<string, unknown>
): string {
  const data = Buffer.from(JSON.stringify(params), 'utf8').toString(
    'base64url'
  );
  return `${INLINE_IMAGE_URI_PREFIX}${tool}?data=${data}`;
}

export function isInlineImageRef(uri: string): boolean {
  return uri.startsWith(INLINE_IMAGE_URI_PREFIX);
}

/**
 * Unwrap a `mapbox://inline-image/...` ref back into its tool name and
 * request params. Returns null if the ref isn't this scheme, names an
 * unrecognized tool, or its data doesn't decode to a JSON object.
 */
export function resolveInlineImageRef(uri: string): InlineImageRef | null {
  if (!isInlineImageRef(uri)) return null;

  let tool: string;
  let encoded: string | null;
  try {
    const parsed = new URL(uri);
    tool = parsed.pathname.replace(/^\//, '');
    encoded = parsed.searchParams.get('data');
  } catch {
    return null;
  }

  if (!INLINE_IMAGE_TOOLS.includes(tool as InlineImageTool)) return null;
  if (!encoded) return null;

  try {
    const params = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (!params || typeof params !== 'object') return null;
    return { tool: tool as InlineImageTool, params };
  } catch {
    return null;
  }
}
