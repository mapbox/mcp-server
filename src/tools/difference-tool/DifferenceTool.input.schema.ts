// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

const PolygonSchema = z
  .array(z.array(CoordinateSchema))
  .min(1)
  .describe(
    'Polygon coordinates as array of rings (first is outer, rest are holes). Each ring is [longitude, latitude] pairs.'
  );

export const DifferenceInputSchema = z.object({
  polygon1: PolygonSchema.describe('The polygon to subtract from'),
  polygon2: PolygonSchema.describe('The polygon to subtract')
});

export type DifferenceInput = z.infer<typeof DifferenceInputSchema>;
