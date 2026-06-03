// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for `render_map_tool`. The tool echoes the payload back so
 * follow-up tool calls (or the LLM itself) can reference what was rendered.
 * Uses `.passthrough()` so the inner `_mapApp` field survives the MCP SDK's
 * output validation.
 */
export const RenderMapOutputSchema = z
  .object({
    rendered: z.boolean().describe('Always true when the call succeeded.'),
    layer_count: z.number().int(),
    marker_count: z.number().int(),
    summary: z.string().optional()
  })
  .passthrough();

export type RenderMapOutput = z.infer<typeof RenderMapOutputSchema>;
