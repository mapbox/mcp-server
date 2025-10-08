// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const OutputSchema = z.object({
  content: z.array(
    z.union([
      z.object({
        type: z.literal('text'),
        text: z.string()
      }),
      z.object({
        type: z.literal('image'),
        data: z.string(),
        mimeType: z.string()
      })
    ])
  ),
  /**
   * An object containing structured tool output.
   *
   * If the Tool defines an outputSchema, this field MUST be present in the result,
   * and contain a JSON object that matches the schema.
   */
  structuredContent: z.object({}).passthrough().optional(),
  isError: z.boolean().default(false)
});
