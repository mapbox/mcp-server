// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for PlaceDetailsTool
 *
 * Models the flat Place record returned by the Mapbox Places API's Details
 * endpoint (`places/v1/details/retrieve`), currently in Public Preview.
 * Nearly every field beyond `mapbox_id`/`name` is optional and every nested
 * object uses .passthrough() — live responses observed during development
 * varied in which fields were present (e.g. `building` and `opening_hours`
 * only appear on some places), and a Public Preview API's contract can add
 * fields without notice, so this schema is deliberately permissive rather
 * than risk an output-validation failure like the one fixed for the
 * previous Details API (see CHANGELOG).
 */
export const PlaceDetailsOutputSchema = z
  .object({
    mapbox_id: z.string(),
    name: z.string(),
    full_address: z.string().optional(),
    brand: z.string().nullable().optional(),
    primary_category: z.string().optional(),
    categories: z.array(z.string()).optional(),
    // OSM opening_hours syntax, e.g. "Mo 09:00-23:45; Tu 09:00-23:45; ...".
    opening_hours: z.string().optional(),
    permanently_closed: z.boolean().nullable().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    status: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    score: z
      .object({
        closed: z.number().nullable().optional(),
        reality: z.number().nullable().optional(),
        popularity: z.number().nullable().optional()
      })
      .passthrough()
      .optional(),
    coordinates: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        source: z.string().optional(),
        routable_points: z
          .array(
            z
              .object({
                name: z.string().optional(),
                latitude: z.number(),
                longitude: z.number()
              })
              .passthrough()
          )
          .optional()
      })
      .passthrough()
      .optional(),
    address: z.object({}).passthrough().optional(),
    attributes: z
      .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
      .optional(),
    building: z.object({}).passthrough().optional(),
    photos: z
      .array(
        z
          .object({
            url: z.string(),
            width: z.number().nullable().optional(),
            height: z.number().nullable().optional(),
            source: z.string().optional()
          })
          .passthrough()
      )
      .optional(),
    telemetry: z.object({}).passthrough().optional()
  })
  .passthrough();

/**
 * Type inference for PlaceDetailsOutput
 */
export type PlaceDetailsOutput = z.infer<typeof PlaceDetailsOutputSchema>;
