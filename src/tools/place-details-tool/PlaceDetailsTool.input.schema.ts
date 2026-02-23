// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import z from 'zod';

/**
 * Input schema for PlaceDetailsTool
 */
export const PlaceDetailsInputSchema = z.object({
  mapbox_id: z
    .string()
    .describe(
      'The Mapbox ID of the place to retrieve details for. Obtained from search results returned by search_and_geocode_tool, category_search_tool, or reverse_geocode_tool (the mapbox_id field in properties).'
    ),
  attribute_sets: z
    .array(z.enum(['basic', 'photos', 'visit', 'venue']))
    .optional()
    .describe(
      'Which attribute sets to include in the response. Options: "basic" (address/coordinates, always included), "photos" (place photo URLs), "visit" (opening hours, rating, price level, popularity), "venue" (phone number, website URL, social media links). When not specified, only basic attributes are returned.'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'BCP 47 language tag for localized results (e.g. "en", "fr", "de", "ja"). Affects place names and address formatting.'
    ),
  worldview: z
    .enum(['ar', 'cn', 'in', 'jp', 'ma', 'ru', 'tr', 'us'])
    .optional()
    .describe(
      'Worldview for geopolitically sensitive content such as disputed borders. Options: "ar" (Argentina), "cn" (China), "in" (India), "jp" (Japan), "ma" (Morocco), "ru" (Russia), "tr" (Turkey), "us" (United States, default).'
    )
});

/**
 * Type inference for PlaceDetailsInput
 */
export type PlaceDetailsInput = z.infer<typeof PlaceDetailsInputSchema>;
