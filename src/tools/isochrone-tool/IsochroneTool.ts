// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { IsochroneInputSchema } from './IsochroneTool.input.schema.js';
import {
  IsochroneResponseSchema,
  type IsochroneResponse
} from './IsochroneTool.output.schema.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import type { MapAppPayload } from '../../utils/mapAppPayload.js';
import { storeMapPayload, renderHint } from '../../utils/storeMapPayload.js';

const HEX6_RE = /^[0-9a-fA-F]{6}$/;
function sanitizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const bare = raw.replace(/^#/, '');
  return HEX6_RE.test(bare) ? `#${bare}` : fallback;
}

export class IsochroneTool extends MapboxApiBasedTool<
  typeof IsochroneInputSchema,
  typeof IsochroneResponseSchema
> {
  name = 'isochrone_tool';
  description = `Computes areas that are reachable within a specified amount of time from a location, and returns the reachable regions as contours of Polygons or LineStrings in GeoJSON format that you can display on a map.
  Common use cases:
    - Show a user how far they can travel in X minutes from their current location
    - Determine whether a destination is within a certain travel time threshold
    - Compare travel ranges for different modes of transportation'`;
  annotations = {
    title: 'Isochrone Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: IsochroneInputSchema,
      outputSchema: IsochroneResponseSchema,
      httpRequest: params.httpRequest
    });
  }

  private formatIsochroneResponse(data: IsochroneResponse): string {
    if (!data.features || data.features.length === 0) {
      return 'No isochrone contours found.';
    }

    const summary = `Found ${data.features.length} isochrone contour${data.features.length > 1 ? 's' : ''}:\n\n`;

    const contours = data.features.map((feature, index) => {
      const props = feature.properties;
      const geomType = feature.geometry.type;

      let description = `${index + 1}. `;
      description += `${geomType} contour for ${props.contour}`;

      if (props.metric === 'time') {
        description += ' minutes travel time';
      } else if (props.metric === 'distance') {
        description += ' meters distance';
      } else {
        description += props.contour <= 60 ? ' minutes' : ' meters';
      }

      if (props.color) {
        description += `\n   Color: ${props.color}`;
      }

      if (geomType === 'Polygon' && props.fillColor) {
        description += `\n   Fill: ${props.fillColor}`;
        if (props.fillOpacity !== undefined) {
          description += ` (opacity: ${props.fillOpacity})`;
        }
      }

      return description;
    });

    return summary + contours.join('\n\n');
  }

  protected async execute(
    input: z.infer<typeof IsochroneInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}isochrone/v1/${input.profile}/${input.coordinates.longitude}%2C${input.coordinates.latitude}`
    );
    url.searchParams.append('access_token', accessToken);
    if (
      (!input.contours_minutes || input.contours_minutes.length === 0) &&
      (!input.contours_meters || input.contours_meters.length === 0)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: "At least one of 'contours_minutes' or 'contours_meters' must be provided"
          }
        ],
        isError: true
      };
    }
    if (input.contours_minutes && input.contours_minutes.length > 0) {
      url.searchParams.append(
        'contours_minutes',
        input.contours_minutes.join(',')
      );
    }
    if (input.contours_meters && input.contours_meters.length > 0) {
      url.searchParams.append(
        'contours_meters',
        input.contours_meters?.join(',')
      );
    }
    if (input.contours_colors && input.contours_colors.length > 0) {
      url.searchParams.append(
        'contours_colors',
        input.contours_colors.join(',')
      );
    }
    if (input.polygons) {
      url.searchParams.append('polygons', String(input.polygons));
    }
    if (input.denoise) {
      url.searchParams.append('denoise', String(input.denoise));
    }
    if (input.generalize) {
      url.searchParams.append('generalize', String(input.generalize));
    }
    if (input.exclude && input.exclude.length > 0) {
      url.searchParams.append('exclude', input.exclude.join(','));
    }
    if (input.depart_at) {
      url.searchParams.append('depart_at', input.depart_at);
    }

    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Isochrone API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const data = await response.json();

    const RESPONSE_SIZE_THRESHOLD = 50 * 1024;
    const responseText = JSON.stringify(data, null, 2);
    const responseSize = responseText.length;

    const mapPayload = buildIsochroneMapPayload(data, input);

    if (responseSize > RESPONSE_SIZE_THRESHOLD) {
      const resourceId = randomBytes(16).toString('hex');
      const resourceUri = `mapbox://temp/isochrone-${resourceId}`;

      temporaryResourceManager.create(resourceId, resourceUri, data, {
        toolName: this.name,
        size: responseSize
      });

      const contourCount =
        (data as { features?: unknown[] }).features?.length ?? 0;
      const summaryText = `Isochrone computed: ${contourCount} contour${contourCount !== 1 ? 's' : ''}\n\n⚠️ Full response (${Math.round(responseSize / 1024)}KB) exceeds context limit.\n\nFull GeoJSON stored as temporary resource.\nResource URI: ${resourceUri}\nTTL: 30 minutes\n\nUse the MCP resource API to retrieve full GeoJSON if needed.`;

      const summaryStructured: Record<string, unknown> = {};
      let largeText = summaryText;
      if (mapPayload) {
        const ref = storeMapPayload(mapPayload);
        summaryStructured.mapboxRender = { ref };
        largeText += renderHint(ref);
      }
      return {
        content: [{ type: 'text', text: largeText }],
        structuredContent: summaryStructured,
        isError: false
      };
    }

    const parsedData = IsochroneResponseSchema.safeParse(data);
    const validated = parsedData.success
      ? parsedData.data
      : (data as IsochroneResponse);

    if (!parsedData.success) {
      this.log(
        'warning',
        `IsochroneTool: Response validation failed: ${parsedData.error.message}`
      );
    }

    const text = parsedData.success
      ? this.formatIsochroneResponse(parsedData.data)
      : responseText;

    const sc: Record<string, unknown> = {
      ...(validated as unknown as Record<string, unknown>)
    };
    let smallText = text;
    if (mapPayload) {
      const ref = storeMapPayload(mapPayload);
      sc.mapboxRender = { ref };
      smallText += renderHint(ref);
    }

    return {
      content: [{ type: 'text', text: smallText }],
      structuredContent: sc,
      isError: false
    };
  }
}

/**
 * Build a `MapAppPayload` from a Mapbox Isochrone API response. Each contour
 * becomes a fill+line layer pair colored per the API-supplied `color`/`fillColor`
 * (or a teal default), with the origin marked.
 */
function buildIsochroneMapPayload(
  data: unknown,
  input: z.infer<typeof IsochroneInputSchema>
): MapAppPayload | null {
  const fc = data as
    | {
        type?: string;
        features?: Array<{
          geometry?: { type?: string; coordinates?: unknown };
          properties?: Record<string, unknown>;
        }>;
      }
    | null
    | undefined;
  if (
    !fc ||
    fc.type !== 'FeatureCollection' ||
    !Array.isArray(fc.features) ||
    fc.features.length === 0
  ) {
    return null;
  }

  // Render contours largest-first → smallest-on-top for a clean layered look.
  const ordered = fc.features.slice().reverse();
  const layers: MapAppPayload['layers'] = [];
  ordered.forEach((feature, i) => {
    const props = feature.properties ?? {};
    const color = sanitizeHex(
      (props as { color?: unknown; fillColor?: unknown }).color ??
        (props as { fillColor?: unknown }).fillColor,
      '#3b82f6'
    );
    const fillOpacity =
      typeof props.fillOpacity === 'number' ? props.fillOpacity : 0.25;

    if (feature.geometry?.type === 'Polygon' && feature.geometry.coordinates) {
      layers.push({
        id: `iso-fill-${i}`,
        type: 'fill',
        data: {
          type: 'Feature',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          geometry: feature.geometry as any,
          properties: {}
        },
        paint: { 'fill-color': color, 'fill-opacity': fillOpacity }
      });
    }
    layers.push({
      id: `iso-line-${i}`,
      type: 'line',
      data: {
        type: 'Feature',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geometry: feature.geometry as any,
        properties: {}
      },
      paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 },
      layout: { 'line-join': 'round', 'line-cap': 'round' }
    });
  });

  const mode = input.profile.replace('mapbox/', '').replace('-', ' ');
  let summary = `Isochrone: ${fc.features.length} contour${fc.features.length !== 1 ? 's' : ''}`;
  if (input.contours_minutes && input.contours_minutes.length > 0) {
    summary = `Reachable by ${mode}: ${input.contours_minutes.map((m) => `${m} min`).join(', ')}`;
  } else if (input.contours_meters && input.contours_meters.length > 0) {
    summary = `Reachable by ${mode}: ${input.contours_meters
      .map((m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`))
      .join(', ')}`;
  }

  return {
    summary,
    layers,
    markers: [
      {
        coordinates: [input.coordinates.longitude, input.coordinates.latitude],
        style: 'pin',
        color: '#0f172a',
        popup: 'Origin'
      }
    ]
  };
}
