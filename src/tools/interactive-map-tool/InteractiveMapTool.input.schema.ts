// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const InteractiveMapInputSchema = z.object({
  center: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-85.0511).max(85.0511)
    })
    .describe(
      'Center point of the map. Longitude: -180 to 180, Latitude: -85.0511 to 85.0511'
    ),
  zoom: z
    .number()
    .min(0)
    .max(22)
    .optional()
    .default(12)
    .describe('Zoom level (0-22). Default: 12'),
  style: z
    .string()
    .optional()
    .default('mapbox://styles/mapbox/streets-v12')
    .describe(
      'Mapbox style URL (e.g., mapbox://styles/mapbox/streets-v12, mapbox://styles/mapbox/satellite-streets-v12, mapbox://styles/mapbox/dark-v11)'
    ),
  markers: z
    .array(
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-85.0511).max(85.0511),
        label: z.string().optional().describe('Text label shown in a popup'),
        color: z
          .string()
          .optional()
          .describe('CSS color for the marker (e.g., "#FF0000", "red")')
      })
    )
    .optional()
    .describe('Array of markers to display on the map')
});
