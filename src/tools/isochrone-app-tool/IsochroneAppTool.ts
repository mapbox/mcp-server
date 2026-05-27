// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { IsochroneAppInputSchema } from './IsochroneAppTool.input.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/isochrone/

interface IsochroneFeature {
  type: 'Feature';
  geometry?: { type: string; coordinates: unknown };
  properties?: {
    contour?: number;
    metric?: 'time' | 'distance';
    color?: string;
    fill?: string;
    fillColor?: string;
    fillOpacity?: number;
  };
}

interface IsochroneResponse {
  type?: 'FeatureCollection';
  features?: IsochroneFeature[];
}

export class IsochroneAppTool extends MapboxApiBasedTool<
  typeof IsochroneAppInputSchema
> {
  name = 'isochrone_app_tool';
  description =
    'Render reachable-area isochrones on an interactive Mapbox GL JS map as an MCP App. ' +
    'Returns the isochrone polygons plus an MCP App resource reference that hosts ' +
    '(Claude Desktop, VS Code, Cursor) render as a live map with the contours drawn as ' +
    'translucent fill layers and the origin point marked. Use this when the user asks ' +
    '"how far can I get in X minutes" or anything that benefits from seeing the reachable ' +
    'area rather than reading raw GeoJSON.';
  annotations = {
    title: 'Isochrone App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/isochrone-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: IsochroneAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof IsochroneAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const { longitude, latitude } = input.coordinates;

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}isochrone/v1/${input.profile}/${longitude}%2C${latitude}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('polygons', 'true');

    if (input.contours_minutes && input.contours_minutes.length > 0) {
      url.searchParams.set(
        'contours_minutes',
        input.contours_minutes.join(',')
      );
    }
    if (input.contours_meters && input.contours_meters.length > 0) {
      url.searchParams.set('contours_meters', input.contours_meters.join(','));
    }
    if (input.contours_colors && input.contours_colors.length > 0) {
      url.searchParams.set('contours_colors', input.contours_colors.join(','));
    }

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const errorText = await this.getErrorMessage(response);
      return {
        content: [{ type: 'text', text: `Isochrone API error: ${errorText}` }],
        isError: true
      };
    }

    const data = (await response.json()) as IsochroneResponse;
    if (!data.features?.length) {
      return {
        content: [
          {
            type: 'text',
            text: 'No isochrone contours returned for the given parameters.'
          }
        ],
        isError: true
      };
    }

    const summary = buildSummary(input, data.features);

    const payload = {
      summary,
      profile: input.profile,
      origin: { longitude, latitude },
      featureCollection: { type: 'FeatureCollection', features: data.features }
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) }
      ],
      structuredContent: { isochrone: payload },
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }
}

function buildSummary(
  input: z.infer<typeof IsochroneAppInputSchema>,
  features: IsochroneFeature[]
): string {
  const mode = input.profile.replace('mapbox/', '').replace('-', ' ');
  if (input.contours_minutes && input.contours_minutes.length > 0) {
    const labels = input.contours_minutes.map((m) => `${m} min`).join(', ');
    return `Reachable by ${mode}: ${labels}`;
  }
  if (input.contours_meters && input.contours_meters.length > 0) {
    const labels = input.contours_meters
      .map((m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`))
      .join(', ');
    return `Reachable by ${mode}: ${labels}`;
  }
  return `Isochrone: ${features.length} contour${features.length !== 1 ? 's' : ''}`;
}
