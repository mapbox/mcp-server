// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for AreaTool
 */
export const AreaOutputSchema = z.object({
  area: z.number().describe('Calculated area'),
  units: z.string().describe('Unit of measurement')
});

/**
 * Type inference for AreaOutput
 */
export type AreaOutput = z.infer<typeof AreaOutputSchema>;
