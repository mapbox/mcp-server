// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { PolygonSchema } from '../shared/polygonSchema.js';

export const DifferenceInputSchema = z.object({
  polygon1: PolygonSchema.describe('The polygon to subtract from'),
  polygon2: PolygonSchema.describe('The polygon to subtract')
});

export type DifferenceInput = z.infer<typeof DifferenceInputSchema>;
