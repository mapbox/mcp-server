// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { GroundLocationInputSchema } from './GroundLocationTool.input.schema.js';
import {
  GroundLocationOutputSchema,
  type GroundLocationOutput
} from './GroundLocationTool.output.schema.js';

// Minimal types for API responses we care about
interface GeocodingFeature {
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    category?: string;
  };
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

interface GeocodingResponse {
  features?: GeocodingFeature[];
}

interface CategorySearchFeature {
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    distance?: number;
  };
  geometry?: {
    type: string;
    coordinates?: [number, number];
  };
}

interface CategorySearchResponse {
  features?: CategorySearchFeature[];
}

interface IsochroneFeature {
  properties?: {
    contour?: number;
    metric?: string;
  };
  geometry?: {
    type: string;
    coordinates?: unknown;
  };
}

interface IsochroneResponse {
  features?: IsochroneFeature[];
}

export class GroundLocationTool extends MapboxApiBasedTool<
  typeof GroundLocationInputSchema,
  typeof GroundLocationOutputSchema
> {
  name = 'ground_location_tool';
  description =
    'Answer questions about what is near a location, what neighborhood a coordinate is in, or what places are within walking/driving distance. Use this as the FIRST and ONLY tool when given coordinates and asked about nearby places, neighborhood context, local discovery, or area summaries — do NOT also call reverse_geocode_tool or search the web for places. Pass the place category (e.g. "restaurant", "coffee", "park") as the query parameter to get nearby POIs in the same call. Returns place name, nearby POIs matching the query, and travel-time reachability — all sourced from live Mapbox data with citations.';
  annotations = {
    title: 'Ground Location Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: GroundLocationInputSchema,
      outputSchema: GroundLocationOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  private async reverseGeocode(
    longitude: number,
    latitude: number,
    accessToken: string,
    language?: string
  ): Promise<{ place: string; full_address?: string }> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/geocode/v6/reverse`
    );
    url.searchParams.append('longitude', longitude.toString());
    url.searchParams.append('latitude', latitude.toString());
    url.searchParams.append('access_token', accessToken);
    url.searchParams.append('limit', '1');
    if (language) url.searchParams.append('language', language);

    const response = await this.httpRequest(url.toString());
    if (!response.ok) return { place: `${latitude}, ${longitude}` };

    const data = (await response.json()) as GeocodingResponse;
    const feature = data.features?.[0];
    if (!feature) return { place: `${latitude}, ${longitude}` };

    const props = feature.properties ?? {};
    return {
      place: props.name ?? `${latitude}, ${longitude}`,
      full_address: props.full_address ?? props.place_formatted
    };
  }

  private async categorySearch(
    query: string,
    longitude: number,
    latitude: number,
    limit: number,
    accessToken: string,
    language?: string
  ): Promise<GroundLocationOutput['nearby_pois']> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/category/${encodeURIComponent(query)}`
    );
    url.searchParams.append('access_token', accessToken);
    url.searchParams.append('proximity', `${longitude},${latitude}`);
    url.searchParams.append('limit', limit.toString());
    if (language) url.searchParams.append('language', language);

    const response = await this.httpRequest(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as CategorySearchResponse;
    return (data.features ?? []).map((f) => {
      const props = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      return {
        name: props.name ?? 'Unknown',
        address: props.full_address ?? props.place_formatted,
        longitude: coords?.[0] ?? longitude,
        latitude: coords?.[1] ?? latitude,
        category: props.poi_category?.[0],
        distance_meters: props.distance
      };
    });
  }

  private async isochrone(
    longitude: number,
    latitude: number,
    profile: string,
    contours_minutes: number[],
    accessToken: string
  ): Promise<GroundLocationOutput['isochrone']> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}isochrone/v1/${profile}/${longitude},${latitude}`
    );
    url.searchParams.append('access_token', accessToken);
    url.searchParams.append('contours_minutes', contours_minutes.join(','));
    url.searchParams.append('polygons', 'true');

    const response = await this.httpRequest(url.toString());
    if (!response.ok) return undefined;

    const data = (await response.json()) as IsochroneResponse;
    if (!data.features?.length) return undefined;

    return {
      profile,
      contours_minutes: data.features
        .map((f) => f.properties?.contour ?? 0)
        .filter(Boolean)
    };
  }

  private formatOutput(result: GroundLocationOutput): string {
    const lines: string[] = [];

    lines.push(`**${result.place}** (live Mapbox data)`);
    if (result.full_address && result.full_address !== result.place) {
      lines.push(result.full_address);
    }
    lines.push('');

    if (result.nearby_pois?.length) {
      lines.push(`Nearby places:`);
      for (const poi of result.nearby_pois) {
        let line = `- ${poi.name}`;
        if (poi.address) line += ` — ${poi.address}`;
        if (poi.distance_meters) {
          line += ` (${Math.round(poi.distance_meters)}m)`;
        }
        lines.push(line);
      }
      lines.push('');
    }

    if (result.isochrone) {
      const { profile, contours_minutes } = result.isochrone;
      lines.push(
        `Reachable by ${profile}: ${contours_minutes.map((m) => `${m} min`).join(', ')}`
      );
      lines.push('');
    }

    lines.push(`*Sources: ${result.citations.join(', ')}*`);

    return lines.join('\n');
  }

  protected async execute(
    input: z.infer<typeof GroundLocationInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const {
      longitude,
      latitude,
      query,
      profile,
      contours_minutes,
      limit,
      language
    } = input;

    const citations: string[] = ['Mapbox Geocoding API'];

    // Fan out all requests in parallel
    const [geocodeResult, poisResult, isochroneResult] = await Promise.all([
      this.reverseGeocode(longitude, latitude, accessToken, language),
      query
        ? this.categorySearch(
            query,
            longitude,
            latitude,
            limit,
            accessToken,
            language
          ).then((pois) => {
            if (pois?.length) citations.push('Mapbox Search API');
            return pois;
          })
        : Promise.resolve(undefined),
      this.isochrone(
        longitude,
        latitude,
        profile,
        contours_minutes,
        accessToken
      ).then((iso) => {
        if (iso) citations.push('Mapbox Isochrone API');
        return iso;
      })
    ]);

    const result: GroundLocationOutput = {
      place: geocodeResult.place,
      full_address: geocodeResult.full_address,
      longitude,
      latitude,
      nearby_pois: poisResult ?? undefined,
      isochrone: isochroneResult ?? undefined,
      citations
    };

    const validated = GroundLocationOutputSchema.safeParse(result);
    const output = validated.success ? validated.data : result;

    return {
      content: [{ type: 'text', text: this.formatOutput(output) }],
      structuredContent: output as unknown as Record<string, unknown>,
      isError: false
    };
  }
}
