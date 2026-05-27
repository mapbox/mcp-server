// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { DirectionsAppInputSchema } from './DirectionsAppTool.input.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

interface RouteFeature {
  geometry?: { type: string; coordinates?: [number, number][] };
  distance?: number;
  duration?: number;
}

interface DirectionsResponse {
  routes?: RouteFeature[];
}

export class DirectionsAppTool extends MapboxApiBasedTool<
  typeof DirectionsAppInputSchema
> {
  name = 'directions_app_tool';
  description =
    'Render a directions route on an interactive Mapbox GL JS map as an MCP App. ' +
    'Returns the route geometry plus an MCP App reference that hosts (Claude Desktop, ' +
    'VS Code, Cursor) render as a live map with the route drawn, start/end markers, ' +
    'and camera fit to the route bounds. Use this when the user asks for a visual, ' +
    'interactive map of a route rather than just turn-by-turn data.';
  annotations = {
    title: 'Directions App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/directions-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: DirectionsAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof DirectionsAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const coords = input.coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}directions/v5/${input.routing_profile}/${encodeURIComponent(coords)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const errorText = await this.getErrorMessage(response);
      return {
        content: [{ type: 'text', text: `Directions API error: ${errorText}` }],
        isError: true
      };
    }

    const data = (await response.json()) as DirectionsResponse;
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      return {
        content: [
          { type: 'text', text: 'No route found for the given coordinates.' }
        ],
        isError: true
      };
    }

    const distanceMiles = route.distance
      ? `${(route.distance / 1609.34).toFixed(1)} mi`
      : 'unknown';
    const durationMin = route.duration
      ? `${Math.round(route.duration / 60)} min`
      : 'unknown';

    const summary = `Route: ${distanceMiles}, ${durationMin}`;

    // The MCP App resource at ui://mapbox/directions-app/index.html parses the
    // route from this text content (JSON-encoded) via the postMessage protocol.
    const routePayload = {
      summary,
      profile: input.routing_profile,
      geometry: route.geometry,
      distance_meters: route.distance,
      duration_seconds: route.duration
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(routePayload) }
      ],
      structuredContent: { route: routePayload },
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }
}
