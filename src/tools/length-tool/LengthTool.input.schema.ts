// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

export const LengthInputSchema = z.object({
  coordinates: z
    .array(CoordinateSchema)
    .min(2)
    .describe('LineString coordinates as [longitude, latitude] pairs'),

  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet'])
    .default('kilometers')
    .describe('Units for the length measurement')
});

export type LengthInput = z.infer<typeof LengthInputSchema>;
