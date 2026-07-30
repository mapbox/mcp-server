// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

import { MapAppRefSchema } from '../../utils/storeMapPayload.js';

export const DifferenceOutputSchema = z
  .object({
    has_difference: z
      .boolean()
      .describe(
        'Whether any area remains after subtracting polygon2 from polygon1'
      ),
    geometry: z
      .record(z.string(), z.unknown())
      .nullable()
      .describe(
        'GeoJSON geometry of the remaining area (polygon1 minus polygon2), or null if polygon2 fully covers polygon1'
      ),
    mapboxRender: MapAppRefSchema.optional()
  })
  .passthrough();

export type DifferenceOutput = z.infer<typeof DifferenceOutputSchema>;
