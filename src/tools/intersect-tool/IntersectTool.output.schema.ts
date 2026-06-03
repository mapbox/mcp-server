// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

import { MapAppRefSchema } from '../../utils/storeMapPayload.js';

export const IntersectOutputSchema = z
  .object({
    intersects: z.boolean().describe('Whether the two polygons overlap'),
    geometry: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe('GeoJSON geometry of the intersection, or null if no overlap'),
    mapboxRender: MapAppRefSchema.optional()
  })
  .passthrough();

export type IntersectOutput = z.infer<typeof IntersectOutputSchema>;
