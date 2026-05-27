// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const SearchAndGeocodeAppInputSchema = z.object({
  q: z
    .string()
    .min(1)
    .max(256)
    .describe('Free-text search query (place name, address, or POI).'),
  proximity: coordinateSchema
    .optional()
    .describe(
      'Bias results toward this location. Strongly recommended for relevant results.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .describe('Maximum number of results to return.')
});

export const CategorySearchAppInputSchema = z.object({
  category: z
    .string()
    .min(1)
    .describe(
      'Canonical category name (e.g. "restaurant", "cafe", "hotel"). Use category_list_tool for the full list.'
    ),
  proximity: coordinateSchema
    .optional()
    .describe(
      'Bias results toward this location. Strongly recommended for relevant results.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe('Maximum number of results to return.')
});

export type SearchAndGeocodeAppInput = z.infer<
  typeof SearchAndGeocodeAppInputSchema
>;
export type CategorySearchAppInput = z.infer<
  typeof CategorySearchAppInputSchema
>;
