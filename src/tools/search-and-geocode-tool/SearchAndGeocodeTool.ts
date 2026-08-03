// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { redactToken } from '../../utils/redactToken.js';
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
import { buildSearchAndGeocodeRequestUrl } from './buildSearchAndGeocodeRequestUrl.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildSelfFetchRef } from '../../utils/selfFetchRef.js';

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
    input: z.infer<typeof SearchAndGeocodeInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const url = buildSearchAndGeocodeRequestUrl({
      input,
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

    this.log(
      'info',
      `SearchAndGeocodeTool: Fetching from URL: ${redactToken(url)}`
    );

    const response = await this.httpRequest(url);

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

    // Check if we have multiple results that might be ambiguous
    const server = this.activeServer;
    if (
      server &&
      data.features &&
      data.features.length >= 2 &&
      data.features.length <= 10
    ) {
      // Use elicitation to let user choose which result they want
      try {
        const options = data.features.map((feature, index) => {
          const props = feature.properties || {};
          let label = props.name || 'Unknown';
          if (props.place_formatted) {
            label += ` - ${props.place_formatted}`;
          } else if (props.full_address) {
            label += ` - ${props.full_address}`;
          }
          return { value: String(index), label };
        });

        // Create a JSON Schema with enum for the selection
        const result = await server.server.elicitInput({
          mode: 'form',
          message: `Found ${data.features.length} results for "${input.q}". Please select the correct location:`,
          requestedSchema: {
            type: 'object',
            properties: {
              selectedIndex: {
                type: 'string',
                title: 'Select Location',
                description: 'Choose the correct location from the results',
                enum: options.map((o) => o.value),
                // Include labels for better UX (some clients may support this)
                enumNames: options.map((o) => o.label)
              }
            },
            required: ['selectedIndex']
          }
        });

        if (result.action === 'accept' && result.content?.selectedIndex) {
          const selectedIndexStr =
            typeof result.content.selectedIndex === 'string'
              ? result.content.selectedIndex
              : String(result.content.selectedIndex);
          const selectedIndex = parseInt(selectedIndexStr, 10);
          const selectedFeature = data.features[selectedIndex];

          // Return only the selected result
          const singleResult: SearchBoxResponse = {
            ...data,
            features: [selectedFeature]
          };

          return this.withMapPayload(
            {
              content: [
                {
                  type: 'text',
                  text: this.formatGeoJsonToText(
                    singleResult as MapboxFeatureCollection
                  )
                }
              ],
              structuredContent: singleResult,
              isError: false
            },
            singleResult,
            input,
            selectedFeature?.properties?.mapbox_id
          );
        } else if (result.action === 'decline') {
          // User declined to select - return all results as before
          this.log(
            'info',
            'SearchAndGeocodeTool: User declined to select a specific result'
          );
        }
      } catch {
        // Elicitation isn't supported by every MCP client (Claude Desktop
        // doesn't, for example). Falling back to "return all results" is the
        // expected behavior — silent, since Claude Desktop's UI flags tool
        // calls that emit notifications/message at any level as visually
        // failed even when the JSON-RPC response is isError: false.
      }
    }

    // Default behavior: return all results
    return this.withMapPayload(
      {
        content: [
          {
            type: 'text',
            text: this.formatGeoJsonToText(data as MapboxFeatureCollection)
          }
        ],
        structuredContent: data,
        isError: false
      },
      data,
      input
    );
  }

  /**
   * Attach a self-fetch `mapboxRender` ref to structuredContent so the map
   * preview fetches its own results directly from the Search API
   * client-side (see selfFetchRef.ts) rather than depend on server-side
   * geometry storage. `selectedMapboxId` is set when elicitation resolved
   * to a single specific result — the client re-fetches the same query and
   * filters down to that result's `mapbox_id` (falling back to showing all
   * fresh results if ranking shifted enough that it's no longer present).
   */
  private withMapPayload(
    base: CallToolResult,
    data: unknown,
    input: z.infer<typeof SearchAndGeocodeInputSchema>,
    selectedMapboxId?: string
  ): CallToolResult {
    const fc = data as
      | { features?: Array<{ geometry?: { type?: string } }> }
      | null
      | undefined;
    const hasPoints =
      Array.isArray(fc?.features) &&
      fc.features.some((f) => f.geometry?.type === 'Point');
    if (!hasPoints && !input.proximity) return base;

    const ref = buildSelfFetchRef('search', {
      q: input.q,
      language: input.language,
      proximity: input.proximity,
      bbox: input.bbox,
      country: input.country,
      types: input.types,
      poi_category: input.poi_category,
      auto_complete: input.auto_complete,
      eta_type: input.eta_type,
      navigation_profile: input.navigation_profile,
      origin: input.origin,
      selectedMapboxId
    });
    const sc = {
      ...((base.structuredContent ?? {}) as Record<string, unknown>),
      mapboxRender: { ref }
    };
    // Append the render hint to the first text content so the LLM sees the
    // exact ref string and doesn't hallucinate a URI.
    const content = (base.content ?? []).map((c, i) =>
      i === 0 && c.type === 'text'
        ? { ...c, text: (c.text as string) + renderHint(ref) }
        : c
    );
    return { ...base, content, structuredContent: sc };
  }
}
