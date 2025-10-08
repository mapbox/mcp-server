// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Translation object schema
const TranslationSchema = z.object({
  language: z.string(),
  name: z.string()
});

// Context sub-object schemas for different geographic levels
const ContextAddressSchema = z.object({
  mapbox_id: z.string(),
  address_number: z.string(),
  street_name: z.string(),
  name: z.string()
});

const ContextStreetSchema = z.object({
  mapbox_id: z.string(),
  name: z.string()
});

const ContextNeighborhoodSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  alternate: z
    .object({
      mapbox_id: z.string(),
      name: z.string()
    })
    .optional(),
  translations: z.record(TranslationSchema).optional()
});

const ContextPostcodeSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  translations: z.record(TranslationSchema).optional()
});

const ContextLocalitySchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  wikidata_id: z.string().optional(),
  alternate: z
    .object({
      mapbox_id: z.string(),
      name: z.string()
    })
    .optional(),
  translations: z.record(TranslationSchema).optional()
});

const ContextPlaceSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  wikidata_id: z.string().optional(),
  alternate: z
    .object({
      mapbox_id: z.string(),
      name: z.string()
    })
    .optional(),
  translations: z.record(TranslationSchema).optional()
});

const ContextDistrictSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  wikidata_id: z.string().optional(),
  translations: z.record(TranslationSchema).optional()
});

const ContextRegionSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  wikidata_id: z.string().optional(),
  region_code: z.string(),
  region_code_full: z.string(),
  translations: z.record(TranslationSchema).optional()
});

const ContextCountrySchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  wikidata_id: z.string().optional(),
  country_code: z.string(),
  country_code_alpha_3: z.string(),
  translations: z.record(TranslationSchema).optional()
});

const ContextBlockSchema = z.object({
  mapbox_id: z.string(),
  name: z.string()
});

const ContextSecondaryAddressSchema = z.object({
  mapbox_id: z.string(),
  name: z.string(),
  designator: z.string(),
  identifier: z.string(),
  extrapolated: z.boolean().optional()
});

// Context object schema
const ContextSchema = z.object({
  address: ContextAddressSchema.optional(),
  street: ContextStreetSchema.optional(),
  neighborhood: ContextNeighborhoodSchema.optional(),
  postcode: ContextPostcodeSchema.optional(),
  locality: ContextLocalitySchema.optional(),
  place: ContextPlaceSchema.optional(),
  district: ContextDistrictSchema.optional(),
  region: ContextRegionSchema.optional(),
  country: ContextCountrySchema.optional(),
  block: ContextBlockSchema.optional(),
  secondary_address: ContextSecondaryAddressSchema.optional()
});

// Match code schema for Smart Address Match
const MatchCodeSchema = z.object({
  address_number: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  street: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  postcode: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  place: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  region: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  locality: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  country: z
    .enum(['matched', 'unmatched', 'not_applicable', 'inferred', 'plausible'])
    .optional(),
  confidence: z.enum(['exact', 'high', 'medium', 'low'])
});

// Routable point schema
const RoutablePointSchema = z.object({
  name: z.string(),
  longitude: z.number(),
  latitude: z.number()
});

// Coordinates object schema
const CoordinatesSchema = z.object({
  longitude: z.number(),
  latitude: z.number(),
  accuracy: z
    .enum([
      'rooftop',
      'parcel',
      'point',
      'interpolated',
      'approximate',
      'intersection'
    ])
    .optional(),
  routable_points: z.array(RoutablePointSchema).optional()
});

// Japanese reading schema
const ReadingSchema = z.object({
  'ja-Kana': z.string().optional(),
  'ja-Latn': z.string().optional()
});

// Feature properties schema
const FeaturePropertiesSchema = z.object({
  mapbox_id: z.string(),
  feature_type: z.enum([
    'country',
    'region',
    'postcode',
    'district',
    'place',
    'locality',
    'neighborhood',
    'street',
    'address',
    'secondary_address',
    'block'
  ]),
  name: z.string(),
  name_preferred: z.string().optional(),
  place_formatted: z.string().optional(),
  full_address: z.string().optional(),
  context: ContextSchema,
  coordinates: CoordinatesSchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  match_code: MatchCodeSchema.optional(),
  reading: ReadingSchema.optional()
});

// GeoJSON Point geometry schema
const PointGeometrySchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()])
});

// Feature schema
const FeatureSchema = z.object({
  id: z.string(),
  type: z.literal('Feature'),
  geometry: PointGeometrySchema,
  properties: FeaturePropertiesSchema
});

// Main Geocoding API response schema (FeatureCollection)
export const GeocodingResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(FeatureSchema),
  attribution: z.string()
});

export type GeocodingResponse = z.infer<typeof GeocodingResponseSchema>;
export type GeocodingFeature = z.infer<typeof FeatureSchema>;
export type GeocodingFeatureProperties = z.infer<
  typeof FeaturePropertiesSchema
>;
export type GeocodingContext = z.infer<typeof ContextSchema>;
export type GeocodingMatchCode = z.infer<typeof MatchCodeSchema>;
