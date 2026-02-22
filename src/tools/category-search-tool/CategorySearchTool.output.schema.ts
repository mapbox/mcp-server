// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Context sub-object schemas for different geographic levels
const ContextCountrySchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    country_code: z.string().optional(),
    country_code_alpha_3: z.string().optional()
  })
  .passthrough();

const ContextRegionSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    region_code: z.string().optional(),
    region_code_full: z.string().optional()
  })
  .passthrough();

const ContextPostcodeSchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

const ContextDistrictSchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

const ContextPlaceSchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

const ContextLocalitySchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

const ContextNeighborhoodSchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

const ContextAddressSchema = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    address_number: z.string().optional(),
    street_name: z.string().optional()
  })
  .passthrough();

const ContextStreetSchema = z
  .object({
    id: z.string().optional(),
    name: z.string()
  })
  .passthrough();

// Context object schema
const ContextSchema = z
  .object({
    country: ContextCountrySchema.optional(),
    region: ContextRegionSchema.optional(),
    postcode: ContextPostcodeSchema.optional(),
    district: ContextDistrictSchema.optional(),
    place: ContextPlaceSchema.optional(),
    locality: ContextLocalitySchema.optional(),
    neighborhood: ContextNeighborhoodSchema.optional(),
    address: ContextAddressSchema.optional(),
    street: ContextStreetSchema.optional()
  })
  .passthrough();

// Routable point schema
const RoutablePointSchema = z
  .object({
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    note: z.string().optional()
  })
  .passthrough();

// Coordinates object schema
const CoordinatesSchema = z
  .object({
    longitude: z.number(),
    latitude: z.number(),
    accuracy: z
      .enum([
        'rooftop',
        'parcel',
        'point',
        'interpolated',
        'intersection',
        'approximate',
        'street'
      ])
      .optional(),
    routable_points: z.array(RoutablePointSchema).optional()
  })
  .passthrough();

// Metadata schema for additional feature information
const MetadataSchema = z
  .object({
    // API sometimes returns string, sometimes array - accept both
    primary_photo: z.union([z.string(), z.array(z.string())]).optional(),
    reading: z
      .object({
        ja_kana: z.string().optional(),
        ja_latin: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

// Feature properties schema
const FeaturePropertiesSchema = z
  .object({
    name: z.string(),
    name_preferred: z.string().optional(),
    mapbox_id: z.string(),
    feature_type: z.enum([
      'poi',
      'country',
      'region',
      'postcode',
      'district',
      'place',
      'locality',
      'neighborhood',
      'address'
    ]),
    address: z.string().optional(),
    full_address: z.string().optional(),
    place_formatted: z.string().optional(),
    context: ContextSchema,
    coordinates: CoordinatesSchema,
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    language: z.string().optional(),
    maki: z.string().optional(),
    poi_category: z.array(z.string()).optional(),
    poi_category_ids: z.array(z.string()).optional(),
    brand: z.array(z.string()).optional(),
    brand_id: z.array(z.string()).optional(),
    external_ids: z.record(z.string()).optional(),
    metadata: MetadataSchema.optional(),
    distance: z.number().optional(),
    eta: z.number().optional(),
    added_distance: z.number().optional(),
    added_time: z.number().optional()
  })
  .passthrough();

// GeoJSON Point geometry schema
const PointGeometrySchema = z
  .object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()])
  })
  .passthrough();

// Feature schema
const FeatureSchema = z
  .object({
    type: z.literal('Feature'),
    geometry: PointGeometrySchema,
    properties: FeaturePropertiesSchema
  })
  .passthrough();

// Main Search Box API Category Search response schema (FeatureCollection)
export const CategorySearchResponseSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(FeatureSchema),
    attribution: z.string()
  })
  .passthrough();

export type CategorySearchResponse = z.infer<
  typeof CategorySearchResponseSchema
>;
export type CategorySearchFeature = z.infer<typeof FeatureSchema>;
export type CategorySearchFeatureProperties = z.infer<
  typeof FeaturePropertiesSchema
>;
export type CategorySearchContext = z.infer<typeof ContextSchema>;
export type CategorySearchCoordinates = z.infer<typeof CoordinatesSchema>;
export type CategorySearchMetadata = z.infer<typeof MetadataSchema>;
