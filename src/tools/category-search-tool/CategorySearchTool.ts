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

        return result;
      }
    );

    return results.join('\n\n');
  }

  protected async execute(
    input: z.infer<typeof CategorySearchInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Build URL with required parameters
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/category/${encodeURIComponent(input.category)}`
    );

    // Add access token
    url.searchParams.append('access_token', accessToken);

    // Add optional parameters
    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    if (input.limit !== undefined) {
      url.searchParams.append('limit', input.limit.toString());
    }

    // Add proximity if provided (API defaults to IP-based location when omitted)
    if (input.proximity) {
      url.searchParams.append(
        'proximity',
        `${input.proximity.longitude},${input.proximity.latitude}`
      );
    }

    if (input.bbox) {
      const { minLongitude, minLatitude, maxLongitude, maxLatitude } =
        input.bbox;
      url.searchParams.append(
        'bbox',
        `${minLongitude},${minLatitude},${maxLongitude},${maxLatitude}`
      );
    }

    if (input.country && input.country.length > 0) {
      url.searchParams.append('country', input.country.join(','));
    }

    if (
      input.poi_category_exclusions &&
      input.poi_category_exclusions.length > 0
    ) {
      url.searchParams.append(
        'poi_category_exclusions',
        input.poi_category_exclusions.join(',')
      );
    }

    // Make the request
    const response = await this.httpRequest(url.toString());

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

    if (input.format === 'json_string') {
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data as unknown as Record<string, unknown>,
        isError: false
      };
    } else {
      return {
        content: [{ type: 'text', text: this.formatGeoJsonToText(data) }],
        structuredContent: data as unknown as Record<string, unknown>,
        isError: false
      };
    }
  }
}
