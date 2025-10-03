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
    .union([
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      }),
      z.string().transform((val) => {
        // Handle special case of 'ip'
        if (val === 'ip') {
          return 'ip' as const;
        }
        // Handle string that looks like an array: "[-82.451668, 27.942964]"
        if (val.startsWith('[') && val.endsWith(']')) {
          const coords = val
            .slice(1, -1)
            .split(',')
            .map((s) => Number(s.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            return coords as [number, number];
          }
        }
        // Handle comma-separated string: "-82.451668,27.942964"
        const parts = val.split(',').map((s) => Number(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return parts as [number, number];
        }
        throw new Error(
          'Invalid proximity format. Expected [longitude, latitude], "longitude,latitude", or "ip"'
        );
      })
    ])
    .optional()
    .describe(
      'Location to bias results towards. Either [longitude, latitude] or "ip" for IP-based location. STRONGLY ENCOURAGED for relevant results.'
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
    .optional()
});
