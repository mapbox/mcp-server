import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

const ForwardGeocodeInputSchema = z.object({
  q: z
    .string()
    .max(256)
    .refine(
      (val) => !val.includes(';'),
      'Search text cannot contain semicolons'
    )
    .refine(
      (val) => val.split(/\s+/).length <= 20,
      'Search text cannot exceed 20 words'
    )
    .describe(
      'Search text to geocode. Max 256 characters, 20 words, no semicolons.'
    ),
  permanent: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether results can be stored permanently'),
  autocomplete: z
    .boolean()
    .optional()
    .default(true)
    .describe('Return partial/suggested results for partial queries'),
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
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw GeoJSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text with place names, addresses, and coordinates. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    ),
  language: z
    .string()
    .optional()
    .describe(
      'IETF language tag for the response (e.g., "en", "es", "fr", "de", "ja")'
    ),
  limit: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (1-10)'),
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
      'Location to bias results towards. Either [longitude, latitude] coordinates or "ip" for IP-based location. Can help get more relevant results when searching in a specific area.'
    ),
  types: z
    .array(
      z.enum([
        'country',
        'region',
        'postcode',
        'district',
        'place',
        'locality',
        'neighborhood',
        'address'
      ])
    )
    .optional()
    .describe('Array of feature types to filter results'),
  worldview: z
    .enum(['us', 'cn', 'jp', 'in'])
    .optional()
    .default('us')
    .describe('Returns features from a specific regional perspective')
});

export class ForwardGeocodeTool extends MapboxApiBasedTool<
  typeof ForwardGeocodeInputSchema
> {
  name = 'forward_geocode_tool';
  description =
    'Forward geocode addresses, cities, towns, neighborhoods, districts, postcodes, regions, and countries using Mapbox Geocoding API v6. Converts location name into geographic coordinates. Setting a proximity point helps to bias results towards a specific area for more relevant results. Do not use this tool for geocoding points of interest like businesses, landmarks, historic sites, museums, etc. Supports both JSON and text output formats.';

  constructor() {
    super({ inputSchema: ForwardGeocodeInputSchema });
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
    input: z.infer<typeof ForwardGeocodeInputSchema>,
    accessToken: string
  ): Promise<{ type: 'text'; text: string }> {
    const url = new URL(
      `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}search/geocode/v6/forward`
    );

    // Required parameters
    url.searchParams.append('q', input.q);
    url.searchParams.append('access_token', accessToken);

    // Optional parameters
    url.searchParams.append('permanent', input.permanent.toString());
    url.searchParams.append('autocomplete', input.autocomplete.toString());
    url.searchParams.append('format', 'geojson');
    url.searchParams.append('limit', input.limit.toString());
    url.searchParams.append('worldview', input.worldview);

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

    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    if (input.proximity) {
      if (input.proximity === 'ip') {
        url.searchParams.append('proximity', 'ip');
      } else {
        const { longitude, latitude } = input.proximity;
        url.searchParams.append('proximity', `${longitude},${latitude}`);
      }
    }

    if (input.types && input.types.length > 0) {
      url.searchParams.append('types', input.types.join(','));
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to geocode: ${response.status} ${response.statusText}`
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
