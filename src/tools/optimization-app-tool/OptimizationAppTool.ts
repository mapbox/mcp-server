// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { OptimizationAppInputSchema } from './OptimizationAppTool.input.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/optimization/

interface Waypoint {
  location: [number, number];
  trips_index?: number;
  waypoint_index: number;
  name?: string;
}

interface Trip {
  geometry?: { type: string; coordinates: [number, number][] };
  duration?: number;
  distance?: number;
  legs?: Array<{ distance?: number; duration?: number }>;
}

interface OptimizationResponse {
  code?: string;
  message?: string;
  trips?: Trip[];
  waypoints?: Waypoint[];
}

export class OptimizationAppTool extends MapboxApiBasedTool<
  typeof OptimizationAppInputSchema
> {
  name = 'optimization_app_tool';
  description =
    'Find the optimal order to visit a set of 2–12 stops and render the resulting trip on an interactive Mapbox GL JS map as an MCP App. ' +
    'Returns the optimized trip plus an MCP App resource reference that hosts (Claude Desktop, VS Code, Cursor) render as a live map with the route drawn, ' +
    'each stop marked with its visit order (1, 2, 3, …), and the camera fit to the trip. ' +
    'Use this when the user asks "what order should I do these errands in" or anything where the visit order matters and they want to see it on a map.';
  annotations = {
    title: 'Optimization App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/optimization-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: OptimizationAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof OptimizationAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const coordsStr = input.coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}optimized-trips/v1/${input.profile}/${encodeURIComponent(coordsStr)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('roundtrip', String(input.roundtrip));
    if (input.source !== 'any') url.searchParams.set('source', input.source);
    if (input.destination !== 'any')
      url.searchParams.set('destination', input.destination);

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const errorText = await this.getErrorMessage(response);
      return {
        content: [
          { type: 'text', text: `Optimization API error: ${errorText}` }
        ],
        isError: true
      };
    }

    const data = (await response.json()) as OptimizationResponse;

    if (data.code && data.code !== 'Ok') {
      return {
        content: [
          {
            type: 'text',
            text: `Optimization error: ${data.message || data.code}`
          }
        ],
        isError: true
      };
    }

    const trip = data.trips?.[0];
    const waypoints = data.waypoints ?? [];
    if (!trip?.geometry?.coordinates?.length || waypoints.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Optimization API returned no usable trip or waypoints.'
          }
        ],
        isError: true
      };
    }

    // Build a list of stops in the OPTIMIZED order using waypoint_index.
    // waypoint_index = position of this stop in the optimized trip.
    const orderedStops = waypoints
      .map((wp, inputIndex) => ({ wp, inputIndex }))
      .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index)
      .map(({ wp, inputIndex }, orderIndex) => ({
        order: orderIndex + 1, // 1-based visit order
        input_index: inputIndex,
        location: wp.location,
        name: wp.name
      }));

    const durationMin = trip.duration
      ? `${(trip.duration / 60).toFixed(1)} min`
      : 'unknown';
    const distanceMiles = trip.distance
      ? `${(trip.distance / 1609.34).toFixed(1)} mi`
      : 'unknown';
    const orderDesc = orderedStops
      .map((s) => `${s.order}: input #${s.input_index}`)
      .join(' → ');

    const summary = `Optimized trip: ${distanceMiles}, ${durationMin}\nOrder — ${orderDesc}`;

    const payload = {
      summary,
      profile: input.profile,
      roundtrip: input.roundtrip,
      geometry: trip.geometry,
      stops: orderedStops,
      distance_meters: trip.distance,
      duration_seconds: trip.duration
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) }
      ],
      structuredContent: { optimization: payload },
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }
}
