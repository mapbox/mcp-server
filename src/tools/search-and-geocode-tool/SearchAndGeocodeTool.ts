import { z } from 'zod';
import { bboxSchema, countrySchema } from '../../schemas/shared.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';

const SearchAndGeocodeInputSchema = z.object({
  q: z
    .string()
    .max(256)
    .describe('Search query text. Limited to 256 characters.'),
  language: z
    .string()
    .optional()
    .describe(
      'ISO language code for the response (e.g., "en", "es", "fr", "de", "ja")'
    ),
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
        // Handle string that looks like an array: "[-82.451668, 27.942964]"
        if (val.startsWith('[') && val.endsWith(']')) {
          const coords = val
            .slice(1, -1)
            .split(',')
            .map((s) => Number(s.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            return coords as [number, number];
          }
        }
        // Handle comma-separated string: "-82.451668,27.942964"
        const parts = val.split(',').map((s) => Number(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return parts as [number, number];
        }
        throw new Error(
          'Invalid proximity format. Expected [longitude, latitude], "longitude,latitude", or "ip"'
        );
      })
    ])
    .optional()
    .describe(
      'Location to bias results towards. Either [longitude, latitude] or "ip" for IP-based location. STRONGLY ENCOURAGED for relevant results.'
    ),
  bbox: bboxSchema
    .optional()
    .describe(
      'Bounding box to limit results within [minLon, minLat, maxLon, maxLat]'
    ),
  country: countrySchema
    .optional()
    .describe('Array of ISO 3166 alpha 2 country codes to limit results'),
  types: z
    .array(z.string())
    .optional()
    .describe(
      'Array of feature types to filter results (e.g., ["poi", "address", "place"])'
    ),
  poi_category: z
    .array(z.string())
    .optional()
    .describe(
      'Array of POI categories to include (e.g., ["restaurant", "cafe"])'
    ),
  auto_complete: z
    .boolean()
    .optional()
    .describe('Enable partial and fuzzy matching'),
  eta_type: z
    .enum(['navigation'])
    .optional()
    .describe('Request estimated time of arrival (ETA) to results'),
  navigation_profile: z
    .enum(['driving', 'walking', 'cycling', 'driving-traffic'])
    .optional()
    .describe('Routing profile for ETA calculations'),
  origin: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .optional()
});

export class SearchAndGeocodeTool extends MapboxApiBasedTool<
  typeof SearchAndGeocodeInputSchema
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

  constructor(private fetchImpl: typeof fetch = fetchClient) {
    super({ inputSchema: SearchAndGeocodeInputSchema });
  }

  private formatGeoJsonToText(geoJsonResponse: any): string {
    if (
      !geoJsonResponse ||
      !geoJsonResponse.features ||
      geoJsonResponse.features.length === 0
    ) {
      return 'No results found.';
    }

    const results = (geoJsonResponse as any).features.map(
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
    input: z.infer<typeof SearchAndGeocodeInputSchema>,
    accessToken: string
  ): Promise<{ type: 'text'; text: string }> {
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

    if (input.proximity) {
      if (input.proximity === 'ip') {
        url.searchParams.append('proximity', 'ip');
      } else if (Array.isArray(input.proximity)) {
        const [lng, lat] = input.proximity;
        url.searchParams.append('proximity', `${lng},${lat}`);
      } else {
        // Object format with longitude/latitude properties
        url.searchParams.append(
          'proximity',
          `${input.proximity.longitude},${input.proximity.latitude}`
        );
      }
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

    const response = await this.fetchImpl(url.toString());

    if (!response.ok) {
      const errorBody = await response.text();
      this.log(
        'error',
        `SearchAndGeocodeTool: API Error - Status: ${response.status}, Body: ${errorBody}`
      );
      throw new Error(
        `Failed to search: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    this.log(
      'info',
      `SearchAndGeocodeTool: Successfully completed search, found ${(data as any).features?.length || 0} results`
    );

    return { type: 'text', text: this.formatGeoJsonToText(data) };
  }
}
