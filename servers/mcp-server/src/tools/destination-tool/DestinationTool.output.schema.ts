// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const DestinationOutputSchema = z.object({
  destination: z
    .object({
      longitude: z.number(),
      latitude: z.number()
    })
    .describe('The calculated destination point'),
  distance: z.number().describe('Distance traveled'),
  bearing: z.number().describe('Bearing used'),
  units: z.string().describe('Distance units')
});

export type DestinationOutput = z.infer<typeof DestinationOutputSchema>;
