// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

export const NearestPointOnLineInputSchema = z.object({
  point: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe('The point to snap to the line'),

  line: z
    .array(CoordinateSchema)
    .min(2)
    .describe('LineString coordinates as [longitude, latitude] pairs'),

  units: z
    .enum(['kilometers', 'miles', 'meters', 'feet'])
    .default('kilometers')
    .describe('Units for the distance result')
});

export type NearestPointOnLineInput = z.infer<
  typeof NearestPointOnLineInputSchema
>;
