// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for CentroidTool
 */
export const CentroidOutputSchema = z.object({
  centroid: z.object({
    longitude: z.number(),
    latitude: z.number()
  })
});

/**
 * Type inference for CentroidOutput
 */
export type CentroidOutput = z.infer<typeof CentroidOutputSchema>;
