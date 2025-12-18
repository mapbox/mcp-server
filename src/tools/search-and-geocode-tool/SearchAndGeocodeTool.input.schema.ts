// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { bboxSchema, countrySchema } from '../../schemas/shared.js';

export const SearchAndGeocodeInputSchema = z.object({
  q: z
    .string()
    .max(256)
    .describe('Search query text. Limited to 256 characters.'),
  language: z
    .string()
    .optional()
    .describe(
      'ISO language code for the response (e.g., "en", "es", "fr", "de", "ja")'
    ),
  proximity: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .optional()
    .describe(
      'Location to bias results towards as {longitude, latitude}. If not provided, defaults to IP-based location. STRONGLY ENCOURAGED for relevant results.'
    ),
  bbox: bboxSchema
    .optional()
    .describe(
      'Bounding box to limit results within [minLon, minLat, maxLon, maxLat]'
    ),
  country: countrySchema
    .optional()
    .describe('Array of ISO 3166 alpha 2 country codes to limit results'),
  types: z
    .array(z.string())
    .optional()
    .describe(
      'Array of feature types to filter results (e.g., ["poi", "address", "place"])'
    ),
  poi_category: z
    .array(z.string())
    .optional()
    .describe(
      'Array of POI categories to include (e.g., ["restaurant", "cafe"])'
    ),
  auto_complete: z
    .boolean()
    .optional()
    .describe('Enable partial and fuzzy matching'),
  eta_type: z
    .enum(['navigation'])
    .optional()
    .describe('Request estimated time of arrival (ETA) to results'),
  navigation_profile: z
    .enum(['driving', 'walking', 'cycling', 'driving-traffic'])
    .optional()
    .describe('Routing profile for ETA calculations'),
  origin: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .optional(),
  compact: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'When true (default), returns simplified GeoJSON with only essential fields (name, address, coordinates, categories, brand). When false, returns full verbose Mapbox API response with all metadata. Only applies to structured content output.'
    )
});
