// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { RenderMapInputSchema } from '../render-map-tool/RenderMapTool.input.schema.js';

/**
 * Same payload input as `render_map_tool`, so refs from other Mapbox tools and
 * inline layers work the same way, plus an optional public token to put in
 * the page instead of the account's default one.
 */
export const ExportMapHtmlInputSchema = RenderMapInputSchema.extend({
  public_token: z
    .string()
    .regex(/^pk\./, 'must be a Mapbox public token (pk.*)')
    .optional()
    .describe(
      "Mapbox public token (pk.*) to put in the page. Defaults to the account's default public token. A URL-restricted token is recommended for a published site."
    )
});

export type ExportMapHtmlInput = z.infer<typeof ExportMapHtmlInputSchema>;
