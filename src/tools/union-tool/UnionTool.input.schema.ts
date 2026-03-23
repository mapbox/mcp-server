// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { PolygonSchema } from '../shared/polygonSchema.js';

export const UnionInputSchema = z.object({
  polygons: z
    .array(PolygonSchema)
    .min(2)
    .describe('Array of polygons to merge into a single union geometry')
});

export type UnionInput = z.infer<typeof UnionInputSchema>;
