// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const ExportMapHtmlOutputSchema = z.object({
  html: z
    .string()
    .describe(
      'Complete HTML document. Save it as its own file, e.g. map.html.'
    ),
  bytes: z.number().int(),
  layer_count: z.number().int(),
  marker_count: z.number().int(),
  live_layer_count: z
    .number()
    .int()
    .describe(
      "Layers the page fetches from the Mapbox API each time it loads, using the page's token."
    ),
  token_source: z
    .enum(['provided', 'access_token', 'account_default', 'server_default'])
    .describe('Where the public token in the page came from.'),
  script_url: z.string().describe('Map script the page loads.'),
  summary: z.string().optional()
});

export type ExportMapHtmlOutput = z.infer<typeof ExportMapHtmlOutputSchema>;
