// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for BufferTool
 */
export const BufferOutputSchema = z.object({
  bufferedPolygon: z
    .array(z.array(z.tuple([z.number(), z.number()])))
    .describe('Buffer polygon as array of rings'),
  distance: z.number(),
  units: z.string()
});

/**
 * Type inference for BufferOutput
 */
export type BufferOutput = z.infer<typeof BufferOutputSchema>;
