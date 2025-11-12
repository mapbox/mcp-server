// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const ResourceReaderToolInputSchema = z.object({
  uri: z
    .string()
    .min(1, 'URI must not be empty')
    .describe(
      'The resource URI to read (e.g., "mapbox://categories" or "mapbox://categories/ja")'
    )
});

export type ResourceReaderToolInput = z.infer<
  typeof ResourceReaderToolInputSchema
>;
