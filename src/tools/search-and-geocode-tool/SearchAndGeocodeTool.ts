// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { SearchAndGeocodeInputSchema } from './SearchAndGeocodeTool.input.schema.js';
import {
  SearchBoxResponseSchema,
  type SearchBoxResponse
} from './SearchAndGeocodeTool.output.schema.js';
import type {
  MapboxFeatureCollection,
  MapboxFeature
} from '../../schemas/geojson.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// API Documentation: https://docs.mapbox.com/api/search/search-box/#search-request

export class SearchAndGeocodeTool extends MapboxApiBasedTool<
  typeof SearchAndGeocodeInputSchema,
  typeof SearchBoxResponseSchema
> {
  name = 'search_and_geocode_tool';
  description =
    "Search for POIs, brands, chains, geocode cities, towns, addresses. Do not use for generic place types such as 'museums', 'coffee shops', 'tacos', etc, because category_search_tool is better for that. Setting a proximity point is strongly encouraged for more local results.";
  annotations = {
    title: 'Search and Geocode Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: SearchAndGeocodeInputSchema,
      outputSchema: SearchBoxResponseSchema,
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
      return 'No results found.';
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
    input: z.infer<typeof SearchAndGeocodeInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    this.log(
      'info',
      `SearchAndGeocodeTool: Starting search with input: ${JSON.stringify(input)}`
    );

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/forward`
    );

    // Required parameters
    url.searchParams.append('q', input.q);
    url.searchParams.append('access_token', accessToken);

    // Optional parameters
    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    // Hard code limit to 10
    url.searchParams.append('limit', '10');

    // Add proximity if provided (API defaults to IP-based location when omitted)
    if (input.proximity) {
      url.searchParams.append(
        'proximity',
        `${input.proximity.longitude},${input.proximity.latitude}`
      );
    }

    if (input.bbox) {
      url.searchParams.append(
        'bbox',
        `${input.bbox.minLongitude},${input.bbox.minLatitude},${input.bbox.maxLongitude},${input.bbox.maxLatitude}`
      );
    }

    if (input.country && input.country.length > 0) {
      url.searchParams.append('country', input.country.join(','));
    }

    if (input.types && input.types.length > 0) {
      url.searchParams.append('types', input.types.join(','));
    }

    if (input.poi_category && input.poi_category.length > 0) {
      url.searchParams.append('poi_category', input.poi_category.join(','));
    }

    if (input.auto_complete !== undefined) {
      url.searchParams.append('auto_complete', input.auto_complete.toString());
    }

    if (input.eta_type) {
      url.searchParams.append('eta_type', input.eta_type);
    }

    if (input.navigation_profile) {
      url.searchParams.append('navigation_profile', input.navigation_profile);
    }

    if (input.origin) {
      url.searchParams.append(
        'origin',
        `${input.origin.longitude},${input.origin.latitude}`
      );
    }

    this.log(
      'info',
      `SearchAndGeocodeTool: Fetching from URL: ${url.toString().replace(accessToken, '[REDACTED]')}`
    );

    const response = await this.httpRequest(url.toString());

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      this.log(
        'error',
        `SearchAndGeocodeTool: API Error - Status: ${response.status}, Message: ${errorMessage}`
      );
      return {
        content: [
          {
            type: 'text',
            text: `Search API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();

    // Validate response against schema with graceful fallback
    let data: SearchBoxResponse;
    try {
      data = SearchBoxResponseSchema.parse(rawData);
    } catch (validationError) {
      this.log(
        'warning',
        `Schema validation failed for search response: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
      // Graceful fallback to raw data
      data = rawData as SearchBoxResponse;
    }

    this.log(
      'info',
      `SearchAndGeocodeTool: Successfully completed search, found ${data.features?.length || 0} results`
    );

    return {
      content: [
        {
          type: 'text',
          text: this.formatGeoJsonToText(data as MapboxFeatureCollection)
        }
      ],
      structuredContent: data,
      isError: false
    };
  }
}
