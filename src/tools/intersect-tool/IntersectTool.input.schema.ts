// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { PolygonSchema } from '../shared/polygonSchema.js';

export const IntersectInputSchema = z.object({
  polygon1: PolygonSchema.describe('First polygon'),
  polygon2: PolygonSchema.describe('Second polygon')
});

export type IntersectInput = z.infer<typeof IntersectInputSchema>;
