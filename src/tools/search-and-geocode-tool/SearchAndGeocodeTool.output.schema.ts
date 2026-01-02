// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Search Box API feature properties schema
const SearchBoxFeaturePropertiesSchema = z
  .object({
    // Basic identification
    mapbox_id: z.string().optional(),
    feature_type: z.string().optional(),
    name: z.string().optional(),
    name_preferred: z.string().optional(),

    // Address components
    full_address: z.string().optional(),
    place_formatted: z.string().optional(),
    address_number: z.string().optional(),
    street_name: z.string().optional(),

    // Administrative areas
    context: z
      .object({
        country: z
          .object({
            name: z.string().optional(),
            country_code: z.string().optional(),
            country_code_alpha_3: z.string().optional()
          })
          .optional(),
        region: z
          .object({
            name: z.string().optional(),
            region_code: z.string().optional(),
            region_code_full: z.string().optional()
          })
          .optional(),
        postcode: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        district: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        place: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        locality: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        neighborhood: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        street: z
          .object({
            name: z.string().optional()
          })
          .optional(),
        address: z
          .object({
            address_number: z.string().optional(),
            street_name: z.string().optional()
          })
          .optional()
      })
      .optional(),

    // Coordinates and bounds
    coordinates: z
      .object({
        longitude: z.number(),
        latitude: z.number(),
        accuracy: z.string().optional(),
        routable_points: z
          .array(
            z.object({
              name: z.string(),
              latitude: z.number(),
              longitude: z.number()
            })
          )
          .optional()
      })
      .optional(),
    bbox: z.array(z.number()).length(4).optional(),

    // Metadata schema for additional feature information
    metadata: z
      .object({
        // API sometimes returns string, sometimes array - accept both
        primary_photo: z.union([z.string(), z.array(z.string())]).optional(),
        reading: z
          .object({
            ja_kana: z.string().optional(),
            ja_latin: z.string().optional()
          })
          .optional()
      })
      .optional(),

    // POI specific fields
    poi_category: z.array(z.string()).optional(),
    poi_category_ids: z.array(z.string()).optional(),
    brand: z.array(z.string()).optional(),
    brand_id: z.union([z.string(), z.array(z.string())]).optional(),
    external_ids: z.record(z.string()).optional(),

    // Additional metadata
    maki: z.string().optional(),
    operational_status: z.string().optional(),

    // ETA information (when requested)
    eta: z
      .object({
        duration: z.number().optional(),
        distance: z.number().optional()
      })
      .optional(),

    // Top-level country field (in addition to context.country)
    // Mapbox Search Box API sometimes returns country at the top level
    country: z.string().optional()
  })
  .passthrough(); // Allow additional properties the API may add in the future

// GeoJSON geometry schema
const GeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number()).length(2)
});

// Search Box API feature schema
const SearchBoxFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: GeometrySchema,
  properties: SearchBoxFeaturePropertiesSchema
});

// Main Search Box API response schema
export const SearchBoxResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(SearchBoxFeatureSchema),
  attribution: z.string().optional()
});

export type SearchBoxResponse = z.infer<typeof SearchBoxResponseSchema>;
export type SearchBoxFeature = z.infer<typeof SearchBoxFeatureSchema>;
export type SearchBoxFeatureProperties = z.infer<
  typeof SearchBoxFeaturePropertiesSchema
>;
