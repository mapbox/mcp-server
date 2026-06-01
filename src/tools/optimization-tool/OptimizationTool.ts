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
import { renderOptimizationAppHtml } from '../../resources/ui-apps/optimizationAppHtml.js';

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
      resourceUri: 'ui://mapbox/optimization-app/index.html',
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

      const content: CallToolResult['content'] = [
        { type: 'text' as const, text }
      ];

      if (isMcpUiEnabled()) {
        const inlineHtml = await tryRenderOptimizationInlineHtml(
          validatedResult,
          input,
          accessToken,
          this.httpRequest
        );
        if (inlineHtml) {
          content.push(
            createUIResource({
              uri: `ui://mapbox/optimization/${randomUUID()}`,
              content: { type: 'rawHtml', htmlString: inlineHtml },
              encoding: 'text',
              uiMetadata: {
                'preferred-frame-size': ['100%', '500px']
              }
            })
          );
        }
      }

      return {
        content,
        structuredContent: validatedResult,
        isError: false
      };
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
 * Bake the optimized trip into the shared iframe template for MCP-UI clients.
 */
async function tryRenderOptimizationInlineHtml(
  result: OptimizationOutput,
  _input: OptimizationInput,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<string | undefined> {
  const trip = result.trips?.[0];
  if (!trip?.geometry) return undefined;

  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  // Sort waypoints by waypoint_index = position in optimized trip
  const stops = (result.waypoints ?? [])
    .map((wp, inputIndex) => ({ wp, inputIndex }))
    .sort((a, b) => a.wp.waypoint_index - b.wp.waypoint_index)
    .map(({ wp, inputIndex }, orderIndex) => ({
      order: orderIndex + 1,
      input_index: inputIndex,
      location: wp.location as [number, number],
      name: wp.name
    }));

  const parts: string[] = [];
  if (typeof trip.distance === 'number') {
    parts.push(`${(trip.distance / 1609.34).toFixed(1)} mi`);
  }
  if (typeof trip.duration === 'number') {
    parts.push(`${Math.round(trip.duration / 60)} min`);
  }
  const summary = `Optimized trip: ${parts.length ? parts.join(', ') : `${stops.length} stops`}`;

  return renderOptimizationAppHtml({
    publicToken,
    initialData: {
      geometry: trip.geometry,
      stops,
      summary
    }
  });
}
