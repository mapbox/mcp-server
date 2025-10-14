// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.input.schema.js';
import type { OverlaySchema } from './StaticMapImageTool.input.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class StaticMapImageTool extends MapboxApiBasedTool<
  typeof StaticMapImageInputSchema
> {
  name = 'static_map_image_tool';
  description =
    'Generates a static map image from Mapbox Static Images API. Supports center coordinates, zoom level (0-22), image size (up to 1280x1280), various Mapbox styles, and overlays (markers, paths, GeoJSON). Returns PNG for vector styles, JPEG for raster-only styles.';
  annotations = {
    title: 'Static Map Image Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: StaticMapImageInputSchema,
      httpRequest: params.httpRequest
    });
  }

  private encodeOverlay(overlay: z.infer<typeof OverlaySchema>): string {
    switch (overlay.type) {
      case 'marker': {
        const size = overlay.size === 'large' ? 'pin-l' : 'pin-s';
        let marker = size;

        if (overlay.label) {
          marker += `-${overlay.label}`;
        }

        if (overlay.color) {
          marker += `+${overlay.color}`;
        }

        return `${marker}(${overlay.longitude},${overlay.latitude})`;
      }

      case 'custom-marker': {
        const encodedUrl = encodeURIComponent(overlay.url);
        return `url-${encodedUrl}(${overlay.longitude},${overlay.latitude})`;
      }

      case 'path': {
        let path = `path-${overlay.strokeWidth}`;

        if (overlay.strokeColor) {
          path += `+${overlay.strokeColor}`;
          if (overlay.strokeOpacity !== undefined) {
            path += `-${overlay.strokeOpacity}`;
          }
        }

        if (overlay.fillColor) {
          path += `+${overlay.fillColor}`;
          if (overlay.fillOpacity !== undefined) {
            path += `-${overlay.fillOpacity}`;
          }
        }

        // URL encode the polyline to handle special characters
        return `${path}(${encodeURIComponent(overlay.encodedPolyline)})`;
      }

      case 'geojson': {
        const geojsonString = JSON.stringify(overlay.data);
        return `geojson(${encodeURIComponent(geojsonString)})`;
      }
    }
  }

  protected async execute(
    input: z.infer<typeof StaticMapImageInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const { longitude: lng, latitude: lat } = input.center;
    const { width, height } = input.size;

    // Build overlay string
    let overlayString = '';
    if (input.overlays && input.overlays.length > 0) {
      const encodedOverlays = input.overlays.map((overlay) => {
        return this.encodeOverlay(overlay);
      });
      overlayString = encodedOverlays.join(',') + '/';
    }

    const density = input.highDensity ? '@2x' : '';
    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}styles/v1/${input.style}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}${density}?access_token=${accessToken}`;

    const response = await this.httpRequest(url);

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch map image: ${response.status} ${response.statusText}`
          }
        ],
        isError: true
      };
    }

    const buffer = await response.arrayBuffer();

    const base64Data = Buffer.from(buffer).toString('base64');

    // Determine MIME type based on style (raster-only styles return JPEG)
    const isRasterStyle = input.style.includes('satellite');
    const mimeType = isRasterStyle ? 'image/jpeg' : 'image/png';

    return {
      content: [
        {
          type: 'image',
          data: base64Data,
          mimeType
        }
      ],
      isError: false
    };
  }
}
