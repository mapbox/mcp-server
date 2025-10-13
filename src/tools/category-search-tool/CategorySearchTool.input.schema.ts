// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { languageSchema, bboxSchema } from '../../schemas/shared.js';

export const CategorySearchInputSchema = z.object({
  category: z
    .string()
    .describe(
      'The canonical place category name to search for (e.g., "restaurant", "hotel", "cafe"). To get the full list of supported categories, use the category_list_tool.'
    ),
  language: languageSchema.optional(),
  limit: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-25)'),
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
        // Handle JSON-stringified object: "{\"longitude\": -82.458107, \"latitude\": 27.937259}"
        if (val.startsWith('{') && val.endsWith('}')) {
          // Reject if over 200 characters
          if (val.length > 200) {
            throw new Error(
              'Proximity JSON string too large. Only latitude/longitude pairs are allowed.'
            );
          }

          const parsed = JSON.parse(val);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.longitude === 'number' &&
            typeof parsed.latitude === 'number'
          ) {
            return { longitude: parsed.longitude, latitude: parsed.latitude };
          }
        }
        // Handle string that looks like an array: "[-82.451668, 27.942964]"
        if (val.startsWith('[') && val.endsWith(']')) {
          const coords = val
            .slice(1, -1)
            .split(',')
            .map((s) => Number(s.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            return { longitude: coords[0], latitude: coords[1] };
          }
        }
        // Handle comma-separated string: "-82.451668,27.942964"
        const parts = val.split(',').map((s) => Number(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return { longitude: parts[0], latitude: parts[1] };
        }
        throw new Error(
          'Invalid proximity format. Expected {longitude, latitude}, "longitude,latitude", or "ip"'
        );
      })
    ])
    .optional()
    .describe(
      'Location to bias results towards. Either coordinate object with longitude and latitude or "ip" for IP-based location'
    ),
  bbox: bboxSchema
    .describe('Bounding box to limit results within specified bounds')
    .optional(),
  country: z
    .array(z.string().length(2))
    .optional()
    .describe('Array of ISO 3166 alpha 2 country codes to limit results'),
  poi_category_exclusions: z
    .array(z.string())
    .optional()
    .describe('Array of POI categories to exclude from results'),
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw GeoJSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text with place names, addresses, and coordinates. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    )
});
