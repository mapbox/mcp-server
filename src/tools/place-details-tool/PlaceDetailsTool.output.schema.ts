// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Output schema for PlaceDetailsTool
 *
 * Models the GeoJSON Feature returned by the Mapbox Details API.
 * Uses passthrough() to allow additional fields from optional attribute_sets
 * (photos, visit, venue) to pass through without validation errors.
 */
export const PlaceDetailsOutputSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()])
      })
      .passthrough(),
    properties: z
      .object({
        name: z.string(),
        mapbox_id: z.string(),
        feature_type: z.string(),
        address: z.string().optional(),
        full_address: z.string().optional(),
        place_formatted: z.string().optional(),
        context: z.object({}).passthrough().optional(),
        coordinates: z
          .object({
            longitude: z.number(),
            latitude: z.number()
          })
          .passthrough()
          .optional(),
        bbox: z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .optional(),
        language: z.string().optional(),
        maki: z.string().optional(),
        poi_category: z.array(z.string()).optional(),
        poi_category_ids: z.array(z.string()).optional(),
        brand: z.array(z.string()).optional(),
        brand_id: z.array(z.string()).optional(),
        external_ids: z.record(z.string()).optional(),
        // metadata contains attribute_set fields (photos, visit, venue)
        metadata: z.object({}).passthrough().optional()
      })
      .passthrough()
  })
  .passthrough();

/**
 * Type inference for PlaceDetailsOutput
 */
export type PlaceDetailsOutput = z.infer<typeof PlaceDetailsOutputSchema>;
