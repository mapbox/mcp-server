// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { IsochroneInputSchema } from './IsochroneTool.input.schema.js';
import {
  IsochroneResponseSchema,
  type IsochroneResponse
} from './IsochroneTool.output.schema.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderIsochroneAppHtml } from '../../resources/ui-apps/isochroneAppHtml.js';

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
        // Fallback - try to infer from contour value
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

    // Check response size and conditionally create temporary resource
    const RESPONSE_SIZE_THRESHOLD = 50 * 1024; // 50KB
    const responseText = JSON.stringify(data, null, 2);
    const responseSize = responseText.length;

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

      return {
        content: [{ type: 'text', text: summaryText }],
        isError: false
      };
    }

    // Validate the response against our schema
    const parsedData = IsochroneResponseSchema.safeParse(data);
    const validatedData = parsedData.success
      ? (parsedData.data as unknown as Record<string, unknown>)
      : (data as Record<string, unknown>);

    if (!parsedData.success) {
      this.log(
        'warning',
        `IsochroneTool: Response validation failed: ${parsedData.error.message}`
      );
    }

    const text = parsedData.success
      ? this.formatIsochroneResponse(parsedData.data)
      : responseText;

    const content: CallToolResult['content'] = [{ type: 'text', text }];

    if (isMcpUiEnabled()) {
      const inlineHtml = await tryRenderIsochroneInlineHtml(
        data,
        input,
        accessToken,
        this.httpRequest
      );
      if (inlineHtml) {
        content.push(
          createUIResource({
            uri: `ui://mapbox/isochrone/${randomUUID()}`,
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
      structuredContent: validatedData,
      isError: false
    };
  }
}

/**
 * Bake the isochrone FeatureCollection + origin coordinates into the shared
 * iframe template so MCP-UI clients render inline without a postMessage hop.
 */
async function tryRenderIsochroneInlineHtml(
  data: unknown,
  input: z.infer<typeof IsochroneInputSchema>,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<string | undefined> {
  const fc = data as { type?: string; features?: unknown[] } | null;
  if (
    !fc ||
    fc.type !== 'FeatureCollection' ||
    !Array.isArray(fc.features) ||
    fc.features.length === 0
  ) {
    return undefined;
  }

  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  const mode = input.profile.replace('mapbox/', '').replace('-', ' ');
  let summary = `Isochrone: ${fc.features.length} contour${fc.features.length !== 1 ? 's' : ''}`;
  if (input.contours_minutes && input.contours_minutes.length > 0) {
    summary = `Reachable by ${mode}: ${input.contours_minutes.map((m) => `${m} min`).join(', ')}`;
  } else if (input.contours_meters && input.contours_meters.length > 0) {
    summary = `Reachable by ${mode}: ${input.contours_meters
      .map((m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`))
      .join(', ')}`;
  }

  return renderIsochroneAppHtml({
    publicToken,
    initialData: {
      featureCollection: fc as { type: string; features: unknown[] },
      origin: input.coordinates,
      summary
    }
  });
}
