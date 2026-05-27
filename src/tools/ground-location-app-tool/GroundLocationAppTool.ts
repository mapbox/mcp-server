// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { GroundLocationAppInputSchema } from './GroundLocationAppTool.input.schema.js';

// Composite: reverse-geocode an origin + (optionally) find nearby places.
// A simpler, app-focused sibling of `ground_location_tool` — the agent
// usually wants to *see* the place and what's around it, not read JSON.

interface GeocodingFeature {
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
  };
}

interface GeocodingResponse {
  features?: GeocodingFeature[];
}

interface PoiFeature {
  type: 'Feature';
  geometry?: { type: string; coordinates: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
  };
}

interface PoiResponse {
  features?: PoiFeature[];
}

export class GroundLocationAppTool extends MapboxApiBasedTool<
  typeof GroundLocationAppInputSchema
> {
  name = 'ground_location_app_tool';
  description =
    'Ground a location and render it on an interactive Mapbox GL JS map (MCP App): reverse-geocodes the coordinates to a place name, optionally finds nearby places matching a query, and draws the origin and POIs on a live map. ' +
    'Use this when the user asks about a place or what is around it and would benefit from a visual rather than text.';
  annotations = {
    title: 'Ground Location App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/ground-location-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: GroundLocationAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof GroundLocationAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const { longitude, latitude } = input.coordinates;

    const [place, pois] = await Promise.all([
      this.reverseGeocode(longitude, latitude, accessToken),
      input.query
        ? this.categorySearch(
            input.query,
            longitude,
            latitude,
            input.limit,
            accessToken
          )
        : Promise.resolve([])
    ]);

    if (!place) {
      return {
        content: [
          {
            type: 'text',
            text: 'Could not reverse-geocode the given coordinates.'
          }
        ],
        isError: true
      };
    }

    const summary = input.query
      ? `${place.name} — ${pois.length} ${input.query} nearby`
      : `${place.name}`;

    const payload = {
      summary,
      origin: {
        longitude,
        latitude,
        name: place.name,
        address: place.address
      },
      query: input.query,
      pois: pois.map((p, i) => ({
        index: i + 1,
        name: p.name,
        address: p.address,
        category: p.category,
        location: p.location
      }))
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) }
      ],
      structuredContent: { ground_location: payload },
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }

  private async reverseGeocode(
    longitude: number,
    latitude: number,
    accessToken: string
  ): Promise<{ name: string; address?: string } | undefined> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/geocode/v6/reverse`
    );
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('limit', '1');
    url.searchParams.set('types', 'neighborhood,locality,place');

    const response = await this.httpRequest(url.toString());
    if (!response.ok) return undefined;

    const data = (await response.json()) as GeocodingResponse;
    const f = data.features?.[0];
    if (!f?.properties?.name) {
      return undefined;
    }
    return {
      name: f.properties.name,
      address: f.properties.full_address ?? f.properties.place_formatted
    };
  }

  private async categorySearch(
    query: string,
    longitude: number,
    latitude: number,
    limit: number,
    accessToken: string
  ): Promise<
    Array<{
      name: string;
      address?: string;
      category?: string;
      location: [number, number];
    }>
  > {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/category/${encodeURIComponent(query)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('proximity', `${longitude},${latitude}`);
    url.searchParams.set('limit', String(limit));

    const response = await this.httpRequest(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as PoiResponse;
    return (data.features ?? [])
      .filter(
        (
          f
        ): f is PoiFeature & {
          geometry: { type: string; coordinates: [number, number] };
        } => !!f.geometry?.coordinates && f.geometry.coordinates.length === 2
      )
      .map((f) => ({
        name: f.properties?.name ?? 'Place',
        address: f.properties?.full_address ?? f.properties?.place_formatted,
        category: f.properties?.poi_category?.[0],
        location: f.geometry.coordinates
      }));
  }
}
