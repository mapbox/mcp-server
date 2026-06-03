// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';
import { createUIResource } from '@mcp-ui/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import {
  OptimizationInputSchema,
  type OptimizationInput
} from './OptimizationTool.input.schema.js';
import {
  OptimizationOutputSchema,
  type OptimizationOutput
} from './OptimizationTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolExecutionContext } from '../../utils/tracing.js';
import type { HttpRequest } from '../../utils/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import {
  decodePolylineWithFallback,
  type MapAppPayload
} from '../../utils/mapAppPayload.js';

/**
 * OptimizationTool - Find optimal route through multiple coordinates (V1 API)
 *
 * Uses the Mapbox Optimization API V1 to solve the Traveling Salesman Problem
 * and return the shortest route by travel time through a set of coordinates.
 */
export class OptimizationTool extends MapboxApiBasedTool<
  typeof OptimizationInputSchema,
  typeof OptimizationOutputSchema
> {
  readonly name = 'optimization_tool';
  readonly description =
    'Find the optimal (shortest by travel time) route through a set of 2-12 coordinates. ' +
    'Solves the Traveling Salesman Problem to determine the best visiting order. ' +
    'Supports options for starting point, ending point, and whether to return to start.';

  readonly annotations = {
    title: 'Optimize Multi-Stop Route',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/map-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: OptimizationInputSchema,
      outputSchema: OptimizationOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: OptimizationInput,
    accessToken: string,
    toolContext: ToolExecutionContext
  ): Promise<CallToolResult> {
    try {
      // Format coordinates for URL: "lon,lat;lon,lat;..."
      const coordinatesStr = input.coordinates
        .map((coord) => `${coord.longitude},${coord.latitude}`)
        .join(';');

      // Build query parameters
      const params = new URLSearchParams({
        access_token: accessToken
      });

      if (input.source) {
        params.set('source', input.source);
      }
      if (input.destination) {
        params.set('destination', input.destination);
      }
      params.set('roundtrip', String(input.roundtrip));

      if (input.geometries) {
        params.set('geometries', input.geometries);
      }
      if (input.overview) {
        params.set('overview', input.overview);
      }
      if (input.steps !== undefined) {
        params.set('steps', String(input.steps));
      }
      if (input.annotations && input.annotations.length > 0) {
        params.set('annotations', input.annotations.join(','));
      }
      if (input.language) {
        params.set('language', input.language);
      }

      // Build URL: GET /optimized-trips/v1/{profile}/{coordinates}
      const url = `${MapboxApiBasedTool.mapboxApiEndpoint}optimized-trips/v1/${input.profile}/${coordinatesStr}?${params.toString()}`;

      toolContext.span.setAttribute(
        'optimization.coordinates_count',
        input.coordinates.length
      );
      toolContext.span.setAttribute('optimization.profile', input.profile);
      toolContext.span.setAttribute('optimization.roundtrip', input.roundtrip);

      // Make synchronous GET request
      const response = await this.httpRequest(url);

      if (!response.ok) {
        const errorMessage = await this.getErrorMessage(response);

        toolContext.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Optimization API error: ${errorMessage}`
            }
          ],
          isError: true
        };
      }

      const data = (await response.json()) as OptimizationOutput;

      // Validate output
      const validatedResult = this.validateOutput(data) as OptimizationOutput;

      // Check for API error in response
      if (validatedResult.code !== 'Ok') {
        const errorMsg = validatedResult.message || validatedResult.code;
        toolContext.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMsg
        });

        return {
          content: [
            { type: 'text' as const, text: `Optimization error: ${errorMsg}` }
          ],
          structuredContent: validatedResult,
          isError: true
        };
      }

      // Format success response
      const trip = validatedResult.trips[0];
      const durationMin = (trip.duration / 60).toFixed(1);
      const distanceKm = (trip.distance / 1000).toFixed(2);

      const text =
        `Optimized route through ${validatedResult.waypoints.length} waypoints:\n` +
        `- Total duration: ${durationMin} minutes\n` +
        `- Total distance: ${distanceKm} km\n` +
        `- Optimized order: ${validatedResult.waypoints.map((_, i) => i).join(' → ')}`;

      toolContext.span.setAttribute(
        'optimization.duration_seconds',
        trip.duration
      );
      toolContext.span.setAttribute(
        'optimization.distance_meters',
        trip.distance
      );
      toolContext.span.setAttribute(
        'optimization.waypoints_count',
        validatedResult.waypoints.length
      );

      const mapPayload = buildOptimizationMapPayload(validatedResult);
      const content: CallToolResult['content'] = [
        { type: 'text' as const, text }
      ];

      if (isMcpUiEnabled() && mapPayload) {
        const publicToken = await resolveMapboxPublicToken({
          accessToken,
          apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
          httpRequest: this.httpRequest
        });
        if (publicToken) {
          const inlineHtml = renderMapAppHtml({
            publicToken,
            initialData: mapPayload
          });
          content.push(
            createUIResource({
              uri: `ui://mapbox/optimization/${randomUUID()}`,
              content: { type: 'rawHtml', htmlString: inlineHtml },
              encoding: 'text',
              uiMetadata: { 'preferred-frame-size': ['100%', '500px'] }
            })
          );
        }
      }

      const sc: Record<string, unknown> = {
        ...(validatedResult as unknown as Record<string, unknown>)
      };
      if (mapPayload) sc._mapApp = mapPayload;

      const result: CallToolResult = {
        content,
        structuredContent: sc,
        isError: false
      };
      if (mapPayload) result._meta = { ui: { payload: mapPayload } };
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toolContext.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      });
      this.log('error', `${this.name}: ${errorMessage}`);
      return {
        content: [
          { type: 'text' as const, text: `OptimizationTool: ${errorMessage}` }
        ],
        isError: true
      };
    }
  }
}

/**
 * Build a `MapAppPayload` from an Optimization API response: a single trip
 * line plus numbered visit-order markers (start=green, end=red, middle=blue).
 * Polyline-encoded geometries are decoded tool-side so the iframe only ever
 * receives GeoJSON.
 */
function buildOptimizationMapPayload(
  result: OptimizationOutput
): MapAppPayload | null {
  const trip = result.trips?.[0];
  if (!trip) return null;

  let coords: [number, number][] | null = null;
  const g = trip.geometry as unknown;
  if (
    g &&
    typeof g === 'object' &&
    (g as { type?: string }).type === 'LineString' &&
    Array.isArray((g as { coordinates?: unknown }).coordinates)
  ) {
    coords = (g as { coordinates: [number, number][] }).coordinates;
  } else if (typeof g === 'string' && g.length > 0) {
    coords = decodePolylineWithFallback(g);
  }
  if (!coords || coords.length === 0) return null;

  // Stops in optimized visit order: sort waypoints by waypoint_index.
  const ordered = (result.waypoints ?? [])
    .map((wp, inputIndex) => ({ wp, inputIndex }))
    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index);

  const markers: MapAppPayload['markers'] = ordered.map((entry, i) => {
    const isStart = i === 0;
    const isEnd = i === ordered.length - 1;
    const label = String(i + 1);
    const color = isStart ? '#22c55e' : isEnd ? '#ef4444' : '#2563eb';
    const popupParts = [`Stop ${i + 1} (input #${entry.inputIndex})`];
    // wp.name is the snapped road name, not a place name — label accordingly.
    if (entry.wp.name) popupParts.push(`on ${entry.wp.name}`);
    return {
      coordinates: entry.wp.location as [number, number],
      style: 'numbered',
      label,
      color,
      popup: popupParts.join(' — ')
    };
  });

  const miles = (trip.distance / 1609.34).toFixed(1);
  const minutes = Math.round(trip.duration / 60);
  const summary = `Optimized trip: ${miles} mi, ${minutes} min`;

  return {
    summary,
    layers: [
      {
        id: 'trip',
        type: 'line',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 5,
          'line-opacity': 0.85
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      }
    ],
    markers
  };
}
