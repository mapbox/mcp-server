// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const section = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    /** Set when the account has more than the first page. */
    truncated: z.boolean().optional(),
    /** Set when this section couldn't be loaded (often a missing scope). */
    error: z.string().optional()
  });

export const AccountStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  visibility: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  center: z.tuple([z.number(), z.number()]).optional(),
  zoom: z.number().optional()
});

export const AccountTilesetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  visibility: z.string().optional(),
  filesize: z.number().optional(),
  created: z.string().optional(),
  modified: z.string().optional()
});

export const AccountTokenSchema = z.object({
  id: z.string().optional(),
  token: z.string(),
  note: z.string().nullable(),
  default: z.boolean(),
  allowedUrls: z.array(z.string()),
  scopes: z.array(z.string()),
  modified: z.string().optional()
});

export const MapboxHomeOutputSchema = z.object({
  home: z.literal(true),
  username: z.string().optional(),
  styles: section(AccountStyleSchema),
  tilesets: section(AccountTilesetSchema),
  tokens: section(AccountTokenSchema)
});

export type AccountStyle = z.infer<typeof AccountStyleSchema>;
export type AccountTileset = z.infer<typeof AccountTilesetSchema>;
export type AccountToken = z.infer<typeof AccountTokenSchema>;
export type MapboxHomeOutput = z.infer<typeof MapboxHomeOutputSchema>;
