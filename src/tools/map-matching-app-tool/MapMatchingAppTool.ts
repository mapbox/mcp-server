// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { MapMatchingAppInputSchema } from './MapMatchingAppTool.input.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/map-matching/

interface MatchingResponse {
  matchings?: Array<{
    geometry?: { type: string; coordinates: [number, number][] };
    distance?: number;
    duration?: number;
    confidence?: number;
  }>;
  tracepoints?: Array<unknown>;
  code?: string;
  message?: string;
}

export class MapMatchingAppTool extends MapboxApiBasedTool<
  typeof MapMatchingAppInputSchema
> {
  name = 'map_matching_app_tool';
  description =
    'Snap a raw GPS trace to the road network and render both the raw trace and the matched route on an interactive Mapbox GL JS map (MCP App). ' +
    'The raw trace is drawn as a dashed orange line; the snapped route is drawn as a solid blue line on top. ' +
    'Useful for verifying how a noisy GPS trace lines up with the road graph.';
  annotations = {
    title: 'Map Matching App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/map-matching-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: MapMatchingAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof MapMatchingAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const coordsStr = input.coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}matching/v5/mapbox/${input.profile}/${encodeURIComponent(coordsStr)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const errorText = await this.getErrorMessage(response);
      return {
        content: [
          { type: 'text', text: `Map Matching API error: ${errorText}` }
        ],
        isError: true
      };
    }

    const data = (await response.json()) as MatchingResponse;
    if (data.code && data.code !== 'Ok') {
      return {
        content: [
          {
            type: 'text',
            text: `Map matching error: ${data.message || data.code}`
          }
        ],
        isError: true
      };
    }

    const matching = data.matchings?.[0];
    if (!matching?.geometry?.coordinates?.length) {
      return {
        content: [
          {
            type: 'text',
            text: 'No matching route returned for the given trace.'
          }
        ],
        isError: true
      };
    }

    const distanceMiles = matching.distance
      ? `${(matching.distance / 1609.34).toFixed(2)} mi`
      : 'unknown';
    const durationMin = matching.duration
      ? `${Math.round(matching.duration / 60)} min`
      : 'unknown';
    const confidence =
      typeof matching.confidence === 'number'
        ? `${(matching.confidence * 100).toFixed(0)}%`
        : 'n/a';

    const summary = `Matched trace: ${distanceMiles}, ${durationMin} (confidence ${confidence})`;

    const payload = {
      summary,
      profile: input.profile,
      raw_trace: {
        type: 'LineString',
        coordinates: input.coordinates.map((c) => [c.longitude, c.latitude])
      },
      matched_geometry: matching.geometry,
      distance_meters: matching.distance,
      duration_seconds: matching.duration,
      confidence: matching.confidence
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) }
      ],
      structuredContent: { map_matching: payload },
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }
}
