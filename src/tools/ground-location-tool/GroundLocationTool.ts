// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { HttpRequest } from '../../utils/types.js';
import { GroundLocationInputSchema } from './GroundLocationTool.input.schema.js';
import {
  GroundLocationOutputSchema,
  type GroundLocationOutput
} from './GroundLocationTool.output.schema.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildSelfFetchRef } from '../../utils/selfFetchRef.js';
import { buildReverseGeocodeUrl } from './buildReverseGeocodeUrl.js';
import { buildCategorySearchRequestUrl } from '../category-search-tool/buildCategorySearchRequestUrl.js';
import { landAtPoint } from './landAtPoint.js';
import { MAX_ZOOM, elevationsAt } from '../elevation-tool/terrain.js';

type GroundingStrategy = 'neighborhood' | 'routing' | 'poi' | 'region';

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
    mapbox_id?: string;
    external_ids?: Record<string, string>;
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
    'Answer questions about what is near a location, what neighborhood a coordinate is in, or what places are within walking/driving distance. Use this when given coordinates and asked about nearby places, neighborhood context, local discovery, or area summaries. It already includes reverse geocoding, so a separate reverse_geocode_tool call is not needed for the same coordinate. Pass the place category (e.g. "restaurant", "coffee", "park") as the query parameter to get nearby POIs in the same call. Returns place name, nearby POIs matching the query, and travel-time reachability — all sourced from live Mapbox data with citations. ' +
    'It also says what the ground is at the point: land use (park, cemetery, school, residential, wood...), a national park or other protected area it is in, a building it is inside, whether it is on water and how far the nearest water is, and its elevation. ' +
    'So use it for "is this spot in a park?" or "is this on the water?" too. For elevation along a path or route, use elevation_tool.';
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

  /**
   * Use sampling to classify what kind of grounding the query needs.
   * Falls back to 'neighborhood' if sampling is unavailable or classification fails.
   */
  private async classifyGroundingStrategy(
    query: string | undefined,
    longitude: number,
    latitude: number
  ): Promise<GroundingStrategy> {
    const server = this.activeServer;
    const samplingCapability = server?.server.getClientCapabilities()?.sampling;
    if (!samplingCapability || !server) {
      return 'neighborhood';
    }

    const contextHint = query ? ` The user also asked about: "${query}".` : '';
    const prompt =
      `A user is asking about a location at coordinates ${latitude}, ${longitude}.${contextHint}\n\n` +
      `Classify what kind of location grounding is needed. Reply with exactly one word:\n` +
      `- "routing" — user needs precise routable coordinates for navigation or directions\n` +
      `- "neighborhood" — user wants to know what area/district/neighborhood this is\n` +
      `- "poi" — user wants nearby points of interest or places of a specific category\n` +
      `- "region" — user wants area/boundary context like travel-time zones or coverage areas`;

    try {
      const result = await server.server.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        maxTokens: 10
      });

      const text =
        result.content.type === 'text'
          ? result.content.text.trim().toLowerCase()
          : '';

      if (
        text === 'routing' ||
        text === 'neighborhood' ||
        text === 'poi' ||
        text === 'region'
      ) {
        this.log(
          'debug',
          `ground_location_tool: sampling classified as "${text}"`
        );
        return text as GroundingStrategy;
      }
    } catch (err) {
      this.log(
        'debug',
        `ground_location_tool: sampling classification failed, falling back to neighborhood: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return 'neighborhood';
  }

  private async reverseGeocode(
    longitude: number,
    latitude: number,
    accessToken: string,
    types: string,
    language?: string
  ): Promise<{ place: string; full_address?: string }> {
    const url = buildReverseGeocodeUrl({
      input: { longitude, latitude, types, language },
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

    const response = await this.httpRequest(url);
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
    const url = buildCategorySearchRequestUrl({
      input: {
        category: query,
        proximity: { longitude, latitude },
        limit,
        language
      },
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

    const response = await this.httpRequest(url);
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
        distance_meters: props.distance,
        mapbox_id: props.mapbox_id,
        external_ids: props.external_ids
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

  /** "On the ground" lines: land use, protected area, building, water, elevation. */
  private formatGround(result: GroundLocationOutput): string[] {
    const lines: string[] = [];
    const land = result.land;
    if (land) {
      const label = (v: string) => v.replace(/_/g, ' ');
      if (land.land_use.length) {
        lines.push(
          `Land use: ${land.land_use
            .map((u) =>
              u.type ? `${label(u.class)} (${label(u.type)})` : label(u.class)
            )
            .join(', ')}`
        );
      }
      for (const area of land.protected_areas ?? []) {
        lines.push(
          `Inside ${area.name ? `${area.name} (${label(area.class)})` : `a ${label(area.class)}`}`
        );
      }
      if (land.building) {
        const { type, height_m, underground } = land.building;
        const details = [
          type && type !== 'building' ? label(type) : undefined,
          height_m !== undefined ? `${Math.round(height_m)} m tall` : undefined,
          underground ? 'underground' : undefined
        ].filter(Boolean);
        lines.push(
          `Inside a building${details.length ? ` (${details.join(', ')})` : ''}`
        );
      }
      if (land.on_water) {
        lines.push('On water');
      } else if (land.nearest_water_m !== undefined) {
        lines.push(`Nearest water: ${land.nearest_water_m} m`);
      }
    }
    if (result.elevation_m !== undefined) {
      lines.push(
        `Elevation: ${(Math.round(result.elevation_m) || 0).toLocaleString('en-US')} m`
      );
    }
    return lines;
  }

  private formatOutput(
    result: GroundLocationOutput,
    strategy: GroundingStrategy
  ): string {
    const lines: string[] = [];

    const strategyLabel: Record<GroundingStrategy, string> = {
      neighborhood: 'neighborhood context',
      routing: 'routing coordinates',
      poi: 'nearby places',
      region: 'region context'
    };

    lines.push(
      `**${result.place}** (${strategyLabel[strategy]} · live Mapbox data)`
    );
    if (result.full_address && result.full_address !== result.place) {
      lines.push(result.full_address);
    }
    lines.push('');

    if (strategy === 'routing') {
      lines.push(
        `Routable coordinates: ${result.latitude}, ${result.longitude}`
      );
      lines.push('');
    }

    const groundLines = this.formatGround(result);
    if (groundLines.length) {
      lines.push(...groundLines, '');
    }

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
      const profileLabel = profile.replace('mapbox/', '').replace('-', ' ');
      lines.push(
        `Reachable by ${profileLabel}: ${contours_minutes.map((m) => `${m} min`).join(', ')}`
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

    // Classify the grounding strategy via sampling (falls back gracefully if unsupported)
    const strategy = await this.classifyGroundingStrategy(
      query,
      longitude,
      latitude
    );

    const citations: string[] = ['Mapbox Geocoding API'];

    // Choose reverse geocode result types based on strategy
    const geocodeTypes =
      strategy === 'routing'
        ? 'address,poi'
        : strategy === 'region'
          ? 'region,district,place'
          : 'neighborhood,locality,place';

    // Fan out requests in parallel, shaped by strategy
    const [
      geocodeResult,
      poisResult,
      isochroneResult,
      landResult,
      elevationResult
    ] = await Promise.all([
      this.reverseGeocode(
        longitude,
        latitude,
        accessToken,
        geocodeTypes,
        language
      ),

      // POIs: always fetch if query given; boost limit for poi-focused strategy
      query || strategy === 'poi'
        ? this.categorySearch(
            query ?? 'place',
            longitude,
            latitude,
            strategy === 'poi' ? Math.max(limit, 15) : limit,
            accessToken,
            language
          ).then((pois) => {
            if (pois?.length) citations.push('Mapbox Search API');
            return pois;
          })
        : Promise.resolve(undefined),

      // Isochrone: always for region/neighborhood strategies
      strategy === 'region' || strategy === 'neighborhood'
        ? this.isochrone(
            longitude,
            latitude,
            profile,
            contours_minutes,
            accessToken
          ).then((iso) => {
            if (iso) citations.push('Mapbox Isochrone API');
            return iso;
          })
        : Promise.resolve(undefined),

      landAtPoint(longitude, latitude, {
        httpRequest: this.httpRequest,
        accessToken,
        apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
      }).then((land) => {
        if (land) citations.push('Mapbox Tilequery API (Streets v8)');
        return land;
      }),

      // One DEM tile. A failed tile leaves the elevation out rather than
      // failing the whole answer.
      elevationsAt([[longitude, latitude]], MAX_ZOOM, {
        httpRequest: this.httpRequest,
        accessToken,
        apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
      }).then(
        ([height]) => {
          citations.push('Mapbox Terrain-DEM');
          return Math.round(height * 10) / 10 || 0;
        },
        () => undefined
      )
    ]);

    const result: GroundLocationOutput = {
      place: geocodeResult.place,
      full_address: geocodeResult.full_address,
      longitude,
      latitude,
      nearby_pois: poisResult ?? undefined,
      isochrone: isochroneResult ?? undefined,
      land: landResult,
      elevation_m: elevationResult,
      citations
    };

    const validated = GroundLocationOutputSchema.safeParse(result);
    const output = validated.success ? validated.data : result;

    const sc: Record<string, unknown> = {
      ...(output as unknown as Record<string, unknown>)
    };
    let textOut = this.formatOutput(output, strategy);

    // The map preview fetches its own results directly from the Geocoding
    // and Search Box APIs (client-side, using the iframe's public token)
    // rather than depend on server-computed geometry stashed behind a ref
    // — see selfFetchRef.ts. The sampling-derived strategy can't be
    // recomputed client-side (sampling is an LLM round-trip through the
    // host, which the iframe can't invoke), so the params it resolved to
    // (geocodeTypes, and the POI query/limit if a POI fetch is needed) are
    // baked into the ref instead. Isochrone contours aren't fetched here —
    // buildGroundLocationPayload never rendered them either, since the
    // tool only surfaces a contour-minutes summary, not the polygons.
    const poiNeeded = Boolean(query) || strategy === 'poi';
    const ref = buildSelfFetchRef('ground_location', {
      longitude,
      latitude,
      geocodeTypes,
      language,
      poi: poiNeeded
        ? {
            query: query ?? 'place',
            limit: strategy === 'poi' ? Math.max(limit, 15) : limit
          }
        : undefined
    });
    sc.mapboxRender = { ref };
    textOut += renderHint(ref);

    return {
      content: [{ type: 'text', text: textOut }],
      structuredContent: sc,
      isError: false
    };
  }
}
