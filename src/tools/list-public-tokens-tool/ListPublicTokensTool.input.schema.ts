// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * Input schema for ListPublicTokensTool
 */
export const ListPublicTokensInputSchema = z.object({
  site_url: z
    .string()
    .url()
    .optional()
    .describe(
      'Where the page or app that will use the token is served from, for example ' +
        '"https://example.com" or "http://localhost:3000". Used to pick a public token ' +
        "that is restricted to that URL. Leave it out if you don't know yet."
    )
});

/**
 * Type inference for ListPublicTokensInput
 */
export type ListPublicTokensInput = z.infer<typeof ListPublicTokensInputSchema>;
