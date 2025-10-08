// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import {
  longitudeSchema,
  latitudeSchema,
  countrySchema,
  languageSchema
} from '../../schemas/shared.js';

export const ReverseGeocodeInputSchema = z.object({
  longitude: longitudeSchema.describe(
    'Longitude coordinate to reverse geocode'
  ),
  latitude: latitudeSchema.describe('Latitude coordinate to reverse geocode'),
  permanent: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether results can be stored permanently'),
  country: countrySchema.optional(),
  language: languageSchema.optional(),
  limit: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .describe(
      'Maximum number of results (1-5). Use 1 for best results. If you need more than 1 result, you must specify exactly one type in the types parameter.'
    ),
  types: z
    .array(
      z.enum([
        'country',
        'region',
        'postcode',
        'district',
        'place',
        'locality',
        'neighborhood',
        'address'
      ])
    )
    .optional()
    .describe('Array of feature types to filter results'),
  worldview: z
    .enum(['us', 'cn', 'jp', 'in'])
    .optional()
    .default('us')
    .describe('Returns features from a specific regional perspective'),
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw GeoJSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text with place names, addresses, and coordinates. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    )
});
