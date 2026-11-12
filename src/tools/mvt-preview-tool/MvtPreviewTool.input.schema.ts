// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Either `file`, the `FileInput` the host passes when it opens a file through
 * the OpenAI MCP Extensions file entrypoint, or `path`, when the model asks to
 * open a local file.
 */
export const MvtPreviewInputSchema = z.object({
  file: z
    .object({
      name: z.string().min(1),
      resourceUri: z.string().min(1)
    })
    .optional()
    .describe('Set by the host when it opens a file. Leave unset.'),
  path: z
    .string()
    .trim()
    .max(4096)
    .regex(
      /^\/.*\.(mvt|pbf)$/i,
      'Expected an absolute path ending in .mvt or .pbf'
    )
    .optional()
    .describe(
      'Absolute path of a local .mvt or .pbf file, for example /Users/me/Downloads/14-9326-4739.mvt.'
    )
});
