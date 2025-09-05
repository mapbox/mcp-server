import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

const CategorySearchInputSchema = z.object({
  category: z
    .string()
    .describe(
      'The canonical category ID to search for (e.g., "restaurant", "hotel", "cafe"). To get the full list of supported categories, use the category_list_tool.'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'ISO language code for the response (e.g., "en", "es", "fr", "de", "ja")'
    ),
  limit: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-25)'),
  proximity: z
    .union([
      z.object({
        longitude: z.number().min(-180).max(180),
        latitude: z.number().min(-90).max(90)
      }),
      z.string().transform((val) => {
        // Handle special case of 'ip'
        if (val === 'ip') {
          return 'ip' as const;
        }
        // Handle JSON-stringified object: "{\"longitude\": -82.458107, \"latitude\": 27.937259}"
        if (val.startsWith('{') && val.endsWith('}')) {
          try {
            const parsed = JSON.parse(val);
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              typeof parsed.longitude === 'number' &&
              typeof parsed.latitude === 'number'
            ) {
              return { longitude: parsed.longitude, latitude: parsed.latitude };
            }
          } catch {
            // Fall back to other formats
          }
        }
        // Handle string that looks like an array: "[-82.451668, 27.942964]"
        if (val.startsWith('[') && val.endsWith(']')) {
          const coords = val
            .slice(1, -1)
            .split(',')
            .map((s) => Number(s.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            return { longitude: coords[0], latitude: coords[1] };
          }
        }
        // Handle comma-separated string: "-82.451668,27.942964"
        const parts = val.split(',').map((s) => Number(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return { longitude: parts[0], latitude: parts[1] };
        }
        throw new Error(
          'Invalid proximity format. Expected {longitude, latitude}, "longitude,latitude", or "ip"'
        );
      })
    ])
    .optional()
    .describe(
      'Location to bias results towards. Either coordinate object with longitude and latitude or "ip" for IP-based location'
    ),
  bbox: z
    .object({
      minLongitude: z.number().min(-180).max(180),
      minLatitude: z.number().min(-90).max(90),
      maxLongitude: z.number().min(-180).max(180),
      maxLatitude: z.number().min(-90).max(90)
    })
    .optional()
    .describe('Bounding box to limit results within specified bounds'),
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

export class CategorySearchTool extends MapboxApiBasedTool<
  typeof CategorySearchInputSchema
> {
  name = 'category_search_tool';
  description =
    "Return all places that match a category (industry, amenity, or NAICS‑style code). Use when the user asks for a type of place, plural or generic terms like 'museums', 'coffee shops', 'electric‑vehicle chargers', or when the query includes is‑a phrases such as 'any', 'all', 'nearby'. Do not use when a unique name or brand is provided. Supports both JSON and text output formats.";

  constructor() {
    super({ inputSchema: CategorySearchInputSchema });
  }

  private formatGeoJsonToText(geoJsonResponse: any): string {
    if (
      !geoJsonResponse ||
      !geoJsonResponse.features ||
      geoJsonResponse.features.length === 0
    ) {
      return 'No results found. This category might not be valid or no places match the search criteria. Use the category_list_tool to see all available categories.';
    }

    const results = geoJsonResponse.features.map(
      (feature: any, index: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry || {};

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
        if (geom.coordinates && Array.isArray(geom.coordinates)) {
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
  ): Promise<{ type: 'text'; text: string }> {
    // Build URL with required parameters
    const url = new URL(
      `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}search/searchbox/v1/category/${encodeURIComponent(input.category)}`
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

    if (input.proximity) {
      if (input.proximity === 'ip') {
        url.searchParams.append('proximity', 'ip');
      } else {
        const { longitude, latitude } = input.proximity;
        url.searchParams.append('proximity', `${longitude},${latitude}`);
      }
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
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to search category: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (input.format === 'json_string') {
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    } else {
      return { type: 'text', text: this.formatGeoJsonToText(data) };
    }
  }
}
