// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import { ReverseGeocodeInputSchema } from './ReverseGeocodeTool.schema.js';

export class ReverseGeocodeTool extends MapboxApiBasedTool<
  typeof ReverseGeocodeInputSchema
> {
  name = 'reverse_geocode_tool';
  description =
    'Find addresses, cities, towns, neighborhoods, postcodes, districts, regions, and countries around a specified geographic coordinate pair. Converts geographic coordinates (longitude, latitude) into human-readable addresses or place names. Use limit=1 for best results. This tool cannot reverse geocode businesses, landmarks, historic sites, and other points of interest that are not of the types mentioned. Supports both JSON and text output formats.';
  annotations = {
    title: 'Reverse Geocode Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(private fetch: typeof globalThis.fetch = fetchClient) {
    super({ inputSchema: ReverseGeocodeInputSchema });
  }

  private formatGeoJsonToText(geoJsonResponse: any): string {
    if (
      !geoJsonResponse ||
      !geoJsonResponse.features ||
      geoJsonResponse.features.length === 0
    ) {
      return 'No results found.';
    }

    const results = geoJsonResponse.features.map(
      (feature: any, index: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry || {};

        let result = `${index + 1}. `;

        // Place name
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
        if (geom.coordinates && Array.isArray(geom.coordinates)) {
          const [lng, lat] = geom.coordinates;
          result += `\n   Coordinates: ${lat}, ${lng}`;
        }

        // Feature type
        if (props.feature_type) {
          result += `\n   Type: ${props.feature_type}`;
        }

        return result;
      }
    );

    return results.join('\n\n');
  }

  protected async execute(
    input: z.infer<typeof ReverseGeocodeInputSchema>,
    accessToken: string
  ): Promise<{ type: 'text'; text: string }> {
    // When limit > 1, must specify exactly one type
    if (
      input.limit &&
      input.limit > 1 &&
      (!input.types || input.types.length !== 1)
    ) {
      throw new Error(
        'When limit > 1 for reverse geocoding, you must specify exactly one type in the types parameter (e.g., types: ["address"]). Consider using limit: 1 instead for best results.'
      );
    }

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/geocode/v6/reverse`
    );

    // Required parameters
    url.searchParams.append('longitude', input.longitude.toString());
    url.searchParams.append('latitude', input.latitude.toString());
    url.searchParams.append('access_token', accessToken);

    // Optional parameters
    url.searchParams.append('permanent', input.permanent.toString());
    url.searchParams.append('limit', input.limit.toString());
    url.searchParams.append('worldview', input.worldview);

    if (input.country && input.country.length > 0) {
      url.searchParams.append('country', input.country.join(','));
    }

    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    if (input.types && input.types.length > 0) {
      url.searchParams.append('types', input.types.join(','));
    }

    const response = await this.fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to reverse geocode: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;

    // Check if the response has features
    if (!data || !data.features || data.features.length === 0) {
      return { type: 'text', text: 'No results found.' };
    }

    if (input.format === 'json_string') {
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    } else {
      return { type: 'text', text: this.formatGeoJsonToText(data) };
    }
  }
}
