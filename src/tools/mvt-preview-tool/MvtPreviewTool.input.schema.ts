// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/** `FileInput` from the OpenAI MCP Extensions file entrypoint. */
export const MvtPreviewInputSchema = z.object({
  file: z.object({
    name: z.string().min(1).describe('File name with its extension.'),
    resourceUri: z
      .string()
      .min(1)
      .describe('Opaque host URI the viewer reads the file through.')
  })
});
