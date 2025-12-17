// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.input.schema.js';
import type { OverlaySchema } from './StaticMapImageTool.input.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';

export class StaticMapImageTool extends MapboxApiBasedTool<
  typeof StaticMapImageInputSchema
> {
  name = 'static_map_image_tool';
  description = `Generate a static map image URL from Mapbox Static Images API. Creates a snapshot/thumbnail of a map location with optional markers, paths, and overlays. Returns a direct URL to the image (PNG or JPEG format), not an embedded image.

  Common use cases:
    - Create shareable map snapshots for reports or documentation
    - Generate thumbnail previews of locations for listings or search results
    - Embed map images in emails, PDFs, or presentations
    - Show route overview as static image
    - Create before/after comparison maps
    - Display location context in non-interactive formats

  Supports:
    - Custom center coordinates and zoom level (0-22)
    - Image dimensions up to 1280x1280 pixels
    - Multiple map styles (streets, satellite, outdoors, dark, light, etc.)
    - Markers with custom colors and labels
    - Paths and polylines (routes, boundaries)
    - GeoJSON overlays for complex shapes

  Output format:
    - Returns direct URL string to image file
    - PNG format for vector styles
    - JPEG format for raster/satellite styles
    - URL can be embedded in HTML, shared, or downloaded

  Related tools:
    - Use directions_tool to get route geometry to display on static map
    - Use search_and_geocode_tool to get coordinates for map center`;
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

    // Build content array with image data
    const content: CallToolResult['content'] = [
      {
        type: 'image',
        data: base64Data,
        mimeType
      }
    ];

    // Conditionally add MCP-UI resource if enabled
    if (isMcpUiEnabled()) {
      const uiResource = createUIResource({
        uri: `ui://mapbox/static-map/${input.style}/${lng},${lat},${input.zoom}`,
        content: {
          type: 'externalUrl',
          iframeUrl: url
        },
        encoding: 'text',
        uiMetadata: {
          'preferred-frame-size': [`${width}px`, `${height}px`]
        }
      });
      content.push(uiResource);
    }

    return {
      content,
      isError: false
    };
  }
}
