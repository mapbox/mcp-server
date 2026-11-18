// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

const RESPONSE_URI_PREFIX = 'mapbox://response/';

/** Tools whose full response can be read back through a response ref. */
const RESPONSE_TOOLS = ['directions', 'isochrone', 'static-map'] as const;
export type ResponseTool = (typeof RESPONSE_TOOLS)[number];

export interface ResponseRefSpec {
  tool: ResponseTool;
  /** The tool's own validated input. */
  input: Record<string, unknown>;
  /** Directions only: the route the user picked among alternatives. */
  selectedRouteIndex?: number;
}

/**
 * Builds a short ref for a tool's full response, for when the response is
 * too large to return inline.
 *
 * The ref carries the call's inputs, not its response (base64 in the URI),
 * and reading it (ToolResponseResource) runs the request again. That keeps
 * it a few hundred bytes, so the summary the model sees stays small, and it
 * needs no server-side storage: the hosted deployment runs several
 * stateless tasks with no session stickiness, so a `mapbox://temp/` ref
 * stored in one task's memory was "not found" whenever the follow-up read
 * landed on another. The tradeoff is a second API request on read, which
 * with live traffic can differ slightly from the original response.
 */
export function buildResponseRef(spec: ResponseRefSpec): string {
  const data = Buffer.from(
    JSON.stringify({
      input: spec.input,
      selectedRouteIndex: spec.selectedRouteIndex
    }),
    'utf8'
  ).toString('base64url');
  return `${RESPONSE_URI_PREFIX}${spec.tool}?data=${data}`;
}

export function isResponseRef(uri: string): boolean {
  return uri.startsWith(RESPONSE_URI_PREFIX);
}

/**
 * Unwraps a `mapbox://response/...` ref. Returns null if it isn't one,
 * names an unknown tool, or doesn't decode. The input still needs
 * validating against the tool's schema before use.
 */
export function resolveResponseRef(uri: string): ResponseRefSpec | null {
  if (!isResponseRef(uri)) return null;

  let tool: string;
  let encoded: string | null;
  try {
    const parsed = new URL(uri);
    tool = parsed.pathname.replace(/^\//, '');
    encoded = parsed.searchParams.get('data');
  } catch {
    return null;
  }
  if (!encoded || !RESPONSE_TOOLS.includes(tool as ResponseTool)) return null;

  let decoded: { input?: unknown; selectedRouteIndex?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded.input !== 'object' || !decoded.input) {
    return null;
  }
  const index = decoded.selectedRouteIndex;
  return {
    tool: tool as ResponseTool,
    input: decoded.input as Record<string, unknown>,
    selectedRouteIndex:
      Number.isInteger(index) && (index as number) >= 0
        ? (index as number)
        : undefined
  };
}
