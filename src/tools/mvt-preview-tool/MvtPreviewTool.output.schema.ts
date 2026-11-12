// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const MvtPreviewOutputSchema = z.object({
  mvtPreview: z.literal(true),
  file: z.object({ name: z.string(), resourceUri: z.string() }),
  /** Tile address read from the file name, when it has one. */
  tile: z
    .object({
      z: z.number().int(),
      x: z.number().int(),
      y: z.number().int()
    })
    .optional()
});

export type MvtPreviewOutput = z.infer<typeof MvtPreviewOutputSchema>;
