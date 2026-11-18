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
      'Only used when mapbox_id resolves via the legacy Details API fallback (boundaries, neighborhoods, cities, regions — see mapbox_id\'s description). Which attribute sets to include in that response. Options: "basic" (name/address/coordinates — always requested regardless of whether you list it here), "photos" (place photo URLs), "visit" (opening hours, rating, price level, popularity), "venue" (phone number, website URL, social media links). Ignored for POI lookups, which go through the Places API and have no equivalent parameter.'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'Only used when mapbox_id resolves via the legacy Details API fallback (see attribute_sets). BCP 47 language tag for localized results (e.g. "en", "fr", "de", "ja"). Affects place names and address formatting. Ignored for POI lookups.'
    ),
  worldview: z
    .enum(['ar', 'cn', 'in', 'jp', 'ma', 'ru', 'tr', 'us'])
    .optional()
    .describe(
      'Only used when mapbox_id resolves via the legacy Details API fallback (see attribute_sets). Worldview for geopolitically sensitive content such as disputed borders. Options: "ar" (Argentina), "cn" (China), "in" (India), "jp" (Japan), "ma" (Morocco), "ru" (Russia), "tr" (Turkey), "us" (United States, default). Ignored for POI lookups.'
    )
});

/**
 * Type inference for PlaceDetailsInput
 */
export type PlaceDetailsInput = z.infer<typeof PlaceDetailsInputSchema>;
