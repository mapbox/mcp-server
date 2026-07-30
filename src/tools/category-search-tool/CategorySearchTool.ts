// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { CategorySearchInputSchema } from './CategorySearchTool.input.schema.js';
import { CategorySearchResponseSchema } from './CategorySearchTool.output.schema.js';
import type {
  MapboxFeatureCollection,
  MapboxFeature
} from '../../schemas/geojson.js';
import { buildCategorySearchRequestUrl } from './buildCategorySearchRequestUrl.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildSelfFetchRef } from '../../utils/selfFetchRef.js';

// API Documentation: https://docs.mapbox.com/api/search/search-box/#category-search

export class CategorySearchTool extends MapboxApiBasedTool<
  typeof CategorySearchInputSchema,
  typeof CategorySearchResponseSchema
> {
  name = 'category_search_tool';
  description =
    "Return all places that match a category (industry, amenity, or NAICS‑style code). Use when the user asks for a type of place, plural or generic terms like 'museums', 'coffee shops', 'electric‑vehicle chargers', or when the query includes is‑a phrases such as 'any', 'all', 'nearby'. Do not use when a unique name or brand is provided. Supports both JSON and text output formats.";
  annotations = {
    title: 'Category Search Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: CategorySearchInputSchema,
      outputSchema: CategorySearchResponseSchema,
      httpRequest: params.httpRequest
    });
  }

  private formatGeoJsonToText(
    geoJsonResponse: MapboxFeatureCollection
  ): string {
    if (
      !geoJsonResponse ||
      !geoJsonResponse.features ||
      geoJsonResponse.features.length === 0
    ) {
      return 'No results found. This category might not be valid or no places match the search criteria. Use the category_list_tool to see all available categories.';
    }

    const results = geoJsonResponse.features.map(
      (feature: MapboxFeature, index: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry;

        let result = `${index + 1}. `;

        // POI name
        result += `${props.name}`;
        if (props.name_preferred) {
          result += ` (${props.name_preferred})`;
        }

        // Full address
        if (props.full_address) {
          result += `\n   Address: ${props.full_address}`;
        } else if (props.place_formatted) {
          result += `\n   Address: ${props.place_formatted}`;
        }

        // Geographic coordinates
        if (geom && geom.type === 'Point' && geom.coordinates) {
          const [lng, lat] = geom.coordinates;
          result += `\n   Coordinates: ${lat}, ${lng}`;
        }

        // Feature type
        if (props.feature_type) {
          result += `\n   Type: ${props.feature_type}`;
        }

        // Category information
        if (props.poi_category && Array.isArray(props.poi_category)) {
          result += `\n   Category: ${props.poi_category.join(', ')}`;
        } else if (props.category) {
          result += `\n   Category: ${props.category}`;
        }

        // Mapbox ID — required for place_details_tool lookups
        if (props.mapbox_id) {
          result += `\n   Mapbox ID: ${props.mapbox_id}`;
        }

        return result;
      }
    );

    return results.join('\n\n');
  }

  protected async execute(
    input: z.infer<typeof CategorySearchInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const url = buildCategorySearchRequestUrl({
      input,
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Category Search API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();

    // Validate response against schema with graceful fallback
    let data: MapboxFeatureCollection;
    try {
      data = CategorySearchResponseSchema.parse(rawData);
    } catch (validationError) {
      this.log(
        'warning',
        `Schema validation failed for category search response: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
      // Graceful fallback to raw data
      data = rawData as MapboxFeatureCollection;
    }

    const baseText =
      input.format === 'json_string'
        ? JSON.stringify(data, null, 2)
        : this.formatGeoJsonToText(data);

    // The map preview fetches its own results directly from the Search Box
    // API (client-side, using the iframe's public token) rather than
    // depend on server-computed geometry stashed behind a ref — see
    // selfFetchRef.ts. Only attach a ref when there's something to show
    // (a point result, or at least a proximity center to draw).
    const hasPoints = Array.isArray(data.features)
      ? data.features.some((f) => f.geometry?.type === 'Point')
      : false;

    const sc: Record<string, unknown> = {
      ...(data as unknown as Record<string, unknown>)
    };
    let textOut = baseText;
    if (hasPoints || input.proximity) {
      const ref = buildSelfFetchRef('category_search', {
        category: input.category,
        language: input.language,
        limit: input.limit,
        proximity: input.proximity,
        bbox: input.bbox,
        country: input.country,
        poi_category_exclusions: input.poi_category_exclusions
      });
      sc.mapboxRender = { ref };
      // Don't append the human-readable hint when the user requested JSON
      // output — it would break round-trip parsing. Callers that pass
      // json_string usually already know about render_map_tool.
      if (input.format !== 'json_string') {
        textOut += renderHint(ref);
      }
    }

    return {
      content: [{ type: 'text', text: textOut }],
      structuredContent: sc,
      isError: false
    };
  }
}
