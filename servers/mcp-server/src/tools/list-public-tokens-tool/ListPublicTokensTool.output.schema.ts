// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const PublicTokenSchema = z.object({
  token: z.string().describe('The public (pk.) token'),
  note: z.string().nullable().describe('The name given to the token'),
  default: z
    .boolean()
    .describe("Whether this is the account's default public token"),
  allowedUrls: z
    .array(z.string())
    .describe(
      'URLs the token is restricted to. Empty means it works from anywhere.'
    ),
  scopes: z.array(z.string()).describe('Scopes granted to the token')
});

export const ListPublicTokensOutputSchema = z.object({
  tokens: z.array(PublicTokenSchema),
  recommended: z
    .object({
      token: z.string(),
      reason: z.string()
    })
    .optional()
    .describe('The token to use for the given site_url, and why'),
  guidance: z.string().describe('How to use the token safely')
});

export type PublicToken = z.infer<typeof PublicTokenSchema>;
export type ListPublicTokensOutput = z.infer<
  typeof ListPublicTokensOutputSchema
>;
