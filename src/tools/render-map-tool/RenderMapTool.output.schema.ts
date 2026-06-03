// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { MapAppRefSchema } from '../../utils/storeMapPayload.js';

/**
 * Output schema for `render_map_tool`. `mapboxRender.ref` is declared because
 * strict client-side validators may strip undeclared fields from the
 * structuredContent — even with `.passthrough()` on the Zod side — and the
 * iframe needs to see the ref to fetch the merged payload via
 * `resources/read`.
 */
export const RenderMapOutputSchema = z
  .object({
    rendered: z.boolean().describe('Always true when the call succeeded.'),
    layer_count: z.number().int(),
    marker_count: z.number().int(),
    summary: z.string().optional(),
    mapboxRender: MapAppRefSchema.optional()
  })
  .passthrough();

export type RenderMapOutput = z.infer<typeof RenderMapOutputSchema>;
