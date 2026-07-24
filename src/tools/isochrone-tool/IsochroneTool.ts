// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { IsochroneInputSchema } from './IsochroneTool.input.schema.js';
import { buildIsochroneRequestUrl } from './buildIsochroneRequestUrl.js';
import {
  IsochroneResponseSchema,
  type IsochroneResponse
} from './IsochroneTool.output.schema.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildSelfFetchRef } from '../../utils/selfFetchRef.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';

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

    const url = buildIsochroneRequestUrl({
      input,
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

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

    // The map preview fetches its own contours directly from the Isochrone
    // API (client-side, using the iframe's public token) rather than
    // depend on server-computed geometry stashed behind a ref — see
    // selfFetchRef.ts. This ref carries only the call's own input params
    // (already visible to the LLM), so unlike a mapbox://temp/ ref there's
    // nothing server-side that a restart or a rehydrated conversation
    // could invalidate.
    const selfFetchRef = buildSelfFetchRef('isochrone', {
      profile: input.profile,
      coordinates: input.coordinates,
      contours_minutes: input.contours_minutes,
      contours_meters: input.contours_meters,
      contours_colors: input.contours_colors,
      polygons: input.polygons,
      denoise: input.denoise,
      generalize: input.generalize,
      exclude: input.exclude,
      depart_at: input.depart_at
    });

    if (responseSize > RESPONSE_SIZE_THRESHOLD) {
      const resourceId = randomBytes(16).toString('hex');
      const resourceUri = `mapbox://temp/isochrone-${resourceId}`;

      temporaryResourceManager.create({
        id: resourceId,
        uri: resourceUri,
        data,
        metadata: { toolName: this.name, size: responseSize },
        owner: getUserNameFromToken(accessToken)
      });

      const contourCount =
        (data as { features?: unknown[] }).features?.length ?? 0;
      const summaryText = `Isochrone computed: ${contourCount} contour${contourCount !== 1 ? 's' : ''}\n\n⚠️ Full response (${Math.round(responseSize / 1024)}KB) exceeds context limit.\n\nFull GeoJSON stored as temporary resource.\nResource URI: ${resourceUri}\nTTL: 30 minutes\n\nUse the MCP resource API to retrieve full GeoJSON if needed.`;

      const summaryStructured: Record<string, unknown> = {
        mapboxRender: { ref: selfFetchRef }
      };
      const largeText = summaryText + renderHint(selfFetchRef);
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
      ...(validated as unknown as Record<string, unknown>),
      mapboxRender: { ref: selfFetchRef }
    };
    const smallText = text + renderHint(selfFetchRef);

    return {
      content: [{ type: 'text', text: smallText }],
      structuredContent: sc,
      isError: false
    };
  }
}
