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
    )
});

/**
 * Type inference for PlaceDetailsInput
 */
export type PlaceDetailsInput = z.infer<typeof PlaceDetailsInputSchema>;
