// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type {
  CallToolResult,
  ReadResourceResult
} from '@modelcontextprotocol/server';

/**
 * A tool result's `structuredContent`, typed as the tool's output type (for
 * example `structuredOf<MidpointOutput>(result)`). The SDK types it as an
 * open object, so tests otherwise can't reach the fields they check.
 */
export function structuredOf<T>(result: CallToolResult): T {
  return result.structuredContent as T;
}

/**
 * The text of a tool result's content block. Throws if that block isn't
 * text, so a test fails on the wrong content type rather than on undefined.
 */
export function textOf(result: CallToolResult, index = 0): string {
  const block = result.content[index];
  if (block?.type !== 'text') {
    throw new Error(
      `content[${index}] is ${block?.type ?? 'missing'}, not text`
    );
  }
  return block.text;
}

/**
 * The text of a resource read's contents entry. Throws if it's a blob.
 */
export function resourceTextOf(result: ReadResourceResult, index = 0): string {
  const entry = result.contents[index];
  if (!entry || !('text' in entry)) {
    throw new Error(`contents[${index}] is not text`);
  }
  return entry.text;
}
