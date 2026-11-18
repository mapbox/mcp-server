// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { MapAppPayloadSchema } from '../../utils/mapAppPayload.js';

/**
 * Output schema for `render_map_tool`. `mapboxRender.ref` is declared because
 * strict client-side validators may strip undeclared fields from the
 * structuredContent — even with `.passthrough()` on the Zod side — and the
 * iframe needs to see the ref to fetch the merged payload via
 * `resources/read`. The rest of `MapAppPayloadSchema` is also declared
 * (all optional) so the inline-payload copy `buildMapboxRenderField` adds
 * for small payloads survives the same strict validation, not just the ref -
 * that inline copy is what makes rendering work on hosts (e.g. ChatGPT) with
 * no `resources/read` equivalent at all.
 */
export const RenderMapOutputSchema = z
  .object({
    rendered: z.boolean().describe('Always true when the call succeeded.'),
    layer_count: z.number().int(),
    marker_count: z.number().int(),
    summary: z.string().optional(),
    mapboxRender: z
      .object({
        ref: z
          .string()
          .describe(
            'Server-side payload reference. Pass to `render_map_tool` via `payload_refs: ["<this ref>"]` to display the data on a live Mapbox GL JS map.'
          )
      })
      .extend(MapAppPayloadSchema.partial().shape)
      .optional()
  })
  .passthrough();

export type RenderMapOutput = z.infer<typeof RenderMapOutputSchema>;
