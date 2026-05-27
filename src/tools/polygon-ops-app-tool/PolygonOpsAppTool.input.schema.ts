// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { PolygonSchema } from '../shared/polygonSchema.js';

export const UnionAppInputSchema = z.object({
  polygons: z
    .array(PolygonSchema)
    .min(2)
    .describe('Two or more polygons to merge into a single union geometry.')
});

export const IntersectAppInputSchema = z.object({
  polygon1: PolygonSchema.describe('First polygon'),
  polygon2: PolygonSchema.describe('Second polygon')
});

export const DifferenceAppInputSchema = z.object({
  polygon1: PolygonSchema.describe('Polygon to subtract from'),
  polygon2: PolygonSchema.describe('Polygon to subtract')
});

export type UnionAppInput = z.infer<typeof UnionAppInputSchema>;
export type IntersectAppInput = z.infer<typeof IntersectAppInputSchema>;
export type DifferenceAppInput = z.infer<typeof DifferenceAppInputSchema>;
