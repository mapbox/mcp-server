// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const IsochroneAppInputSchema = z
  .object({
    profile: z
      .enum([
        'mapbox/driving',
        'mapbox/driving-traffic',
        'mapbox/walking',
        'mapbox/cycling'
      ])
      .default('mapbox/driving')
      .describe('Mode of travel.'),
    coordinates: coordinateSchema.describe(
      'Center point of the isochrone (longitude, latitude).'
    ),
    contours_minutes: z
      .array(z.number().int().min(1).max(60))
      .min(1)
      .max(4)
      .optional()
      .describe(
        'Contour times in minutes, ascending. Either contours_minutes or contours_meters is required.'
      ),
    contours_meters: z
      .array(z.number().int().min(1).max(100000))
      .min(1)
      .max(4)
      .optional()
      .describe(
        'Contour distances in meters, ascending. Either contours_minutes or contours_meters is required.'
      ),
    contours_colors: z
      .array(z.string().regex(/^[0-9a-fA-F]{6}$/))
      .max(4)
      .optional()
      .describe(
        'Hex colors (no leading #) for each contour. Length must match the contour values if provided.'
      )
  })
  .refine(
    (val) =>
      (val.contours_minutes && val.contours_minutes.length > 0) ||
      (val.contours_meters && val.contours_meters.length > 0),
    {
      message: 'Provide at least one of contours_minutes or contours_meters.'
    }
  );

export type IsochroneAppInput = z.infer<typeof IsochroneAppInputSchema>;
