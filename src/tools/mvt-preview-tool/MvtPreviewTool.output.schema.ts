// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const MvtPreviewOutputSchema = z.object({
  mvtPreview: z.literal(true),
  /** The file the host opened; the page reads it through the host. */
  file: z.object({ name: z.string(), resourceUri: z.string() }).optional(),
  /** A local file the model asked for; the page asks the host to open it. */
  path: z.string().optional(),
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
