// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const LengthOutputSchema = z.object({
  length: z.number().describe('Total length of the line'),
  units: z.string().describe('Units of measurement'),
  num_coordinates: z
    .number()
    .describe('Number of coordinate points in the line')
});

export type LengthOutput = z.infer<typeof LengthOutputSchema>;
