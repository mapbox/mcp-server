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

export const IntersectInputSchema = z.object({
  polygon1: PolygonSchema.describe('First polygon'),
  polygon2: PolygonSchema.describe('Second polygon')
});

export type IntersectInput = z.infer<typeof IntersectInputSchema>;
