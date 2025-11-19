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
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .optional()
    .describe(
      'Location to bias results towards as {longitude, latitude}. If not provided, defaults to IP-based location.'
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
