// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { URLSearchParams } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapMatchingInputSchema } from './MapMatchingTool.input.schema.js';
import {
  MapMatchingOutputSchema,
  type MapMatchingOutput
} from './MapMatchingTool.output.schema.js';
import type { HttpRequest } from '../../utils/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import {
  decodePolylineWithFallback,
  type MapAppPayload
} from '../../utils/mapAppPayload.js';

// Docs: https://docs.mapbox.com/api/navigation/map-matching/

export class MapMatchingTool extends MapboxApiBasedTool<
  typeof MapMatchingInputSchema,
  typeof MapMatchingOutputSchema
> {
  name = 'map_matching_tool';
  description =
    'Snap GPS traces to roads using Mapbox Map Matching API. Takes noisy/inaccurate ' +
    'coordinate sequences (2-100 points) and returns clean routes aligned with actual ' +
    'roads, bike paths, or walkways. Useful for analyzing recorded trips, cleaning ' +
    'fleet tracking data, or processing fitness activity traces. Returns confidence ' +
    'scores, matched geometry, and optional traffic/speed annotations.';
  annotations = {
    title: 'Map Matching Tool',
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
      inputSchema: MapMatchingInputSchema,
      outputSchema: MapMatchingOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof MapMatchingInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Validate timestamps array length matches coordinates
    if (
      input.timestamps &&
      input.timestamps.length !== input.coordinates.length
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'The timestamps array must have the same length as the coordinates array'
          }
        ],
        isError: true
      };
    }

    // Validate radiuses array length matches coordinates
    if (input.radiuses && input.radiuses.length !== input.coordinates.length) {
      return {
        content: [
          {
            type: 'text',
            text: 'The radiuses array must have the same length as the coordinates array'
          }
        ],
        isError: true
      };
    }

    // Build coordinate string: "lon1,lat1;lon2,lat2;..."
    const coordsString = input.coordinates
      .map((coord) => `${coord.longitude},${coord.latitude}`)
      .join(';');

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('access_token', accessToken);
    queryParams.append('geometries', input.geometries);
    queryParams.append('overview', input.overview);

    // Add timestamps if provided (semicolon-separated)
    if (input.timestamps) {
      queryParams.append('timestamps', input.timestamps.join(';'));
    }

    // Add radiuses if provided (semicolon-separated)
    if (input.radiuses) {
      queryParams.append('radiuses', input.radiuses.join(';'));
    }

    // Add annotations if provided (comma-separated)
    if (input.annotations && input.annotations.length > 0) {
      queryParams.append('annotations', input.annotations.join(','));
    }

    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}matching/v5/mapbox/${input.profile}/${coordsString}?${queryParams.toString()}`;

    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Map Matching API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const data = (await response.json()) as MapMatchingOutput;

    let validatedData: MapMatchingOutput;
    try {
      validatedData = MapMatchingOutputSchema.parse(data);
    } catch (validationError) {
      this.log(
        'warning',
        `Schema validation warning: ${validationError instanceof Error ? validationError.message : String(validationError)}`
      );
      validatedData = data;
    }

    const mapPayload = buildMapMatchingPayload(validatedData, input);
    const content: CallToolResult['content'] = [
      { type: 'text', text: JSON.stringify(validatedData, null, 2) }
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
            uri: `ui://mapbox/map-matching/${randomUUID()}`,
            content: { type: 'rawHtml', htmlString: inlineHtml },
            encoding: 'text',
            uiMetadata: { 'preferred-frame-size': ['100%', '500px'] }
          })
        );
      }
    }

    const sc: Record<string, unknown> = {
      ...(validatedData as unknown as Record<string, unknown>)
    };
    if (mapPayload) sc._mapApp = mapPayload;

    const result: CallToolResult = {
      content,
      structuredContent: sc,
      isError: false
    };
    if (mapPayload) result._meta = { ui: { payload: mapPayload } };
    return result;
  }
}

/**
 * Build a payload showing the raw GPS trace as a dashed orange line and
 * the matched route as a solid blue line, with a legend explaining both.
 */
function buildMapMatchingPayload(
  data: MapMatchingOutput,
  input: z.infer<typeof MapMatchingInputSchema>
): MapAppPayload | null {
  const match = data.matchings?.[0];
  if (!match) return null;

  let matchedCoords: [number, number][] | null = null;
  const g = match.geometry as unknown;
  if (
    g &&
    typeof g === 'object' &&
    (g as { type?: string }).type === 'LineString' &&
    Array.isArray((g as { coordinates?: unknown }).coordinates)
  ) {
    matchedCoords = (g as { coordinates: [number, number][] }).coordinates;
  } else if (typeof g === 'string' && g.length > 0) {
    matchedCoords = decodePolylineWithFallback(g);
  }
  if (!matchedCoords || matchedCoords.length === 0) return null;

  const rawCoords: [number, number][] = input.coordinates.map((c) => [
    c.longitude,
    c.latitude
  ]);

  const matched = data.tracepoints?.filter((t) => t != null).length ?? 0;
  const total = data.tracepoints?.length ?? input.coordinates.length;

  return {
    summary: `Matched ${matched}/${total} GPS points (confidence ${(match.confidence * 100).toFixed(0)}%)`,
    layers: [
      {
        id: 'raw-trace',
        type: 'line',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: rawCoords },
          properties: {}
        },
        paint: {
          'line-color': '#f97316',
          'line-width': 2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.8
        },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      },
      {
        id: 'matched-route',
        type: 'line',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: matchedCoords },
          properties: {}
        },
        paint: { 'line-color': '#3b82f6', 'line-width': 4 },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      }
    ],
    legend: [
      { label: 'Raw trace', color: '#f97316' },
      { label: 'Matched route', color: '#3b82f6' }
    ]
  };
}
