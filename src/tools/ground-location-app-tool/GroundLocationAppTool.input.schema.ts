// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const GroundLocationAppInputSchema = z.object({
  coordinates: coordinateSchema.describe(
    'Location to ground — longitude/latitude pair the user is asking about.'
  ),
  query: z
    .string()
    .optional()
    .describe(
      'Optional category/keyword to find nearby places (e.g. "restaurant", "coffee", "pharmacy").'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(8)
    .describe('Maximum number of nearby places to return.')
});

export type GroundLocationAppInput = z.infer<
  typeof GroundLocationAppInputSchema
>;
