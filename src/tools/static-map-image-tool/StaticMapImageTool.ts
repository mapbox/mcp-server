// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.input.schema.js';
import type { OverlaySchema } from './StaticMapImageTool.input.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';

// Images larger than this threshold are stored as temporary resources instead
// of being inlined as base64, to avoid exceeding Claude Desktop's 1MB tool
// result limit. base64 adds ~33% overhead, so 700KB raw ≈ 933KB encoded.
const IMAGE_INLINE_THRESHOLD = 700 * 1024; // 700KB

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
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/static-map/index.html',
      csp: {
        connectDomains: ['https://api.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
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
    const encodedStyle = input.style
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const publicUrl = `${MapboxApiBasedTool.mapboxApiEndpoint}styles/v1/${encodedStyle}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}${density}`;
    const url = `${publicUrl}?access_token=${accessToken}`;

    // Fetch image
    const response = await this.httpRequest(url);
    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }
    const buffer = await response.arrayBuffer();
    const isRasterStyle = input.style.includes('satellite');
    const mimeType = isRasterStyle ? 'image/jpeg' : 'image/png';

    // content[0] MUST be the URL text — MCP Apps UI finds it via content.find(c => c.type === 'text')
    // Use public URL (without credentials) to avoid leaking the access token
    const content: CallToolResult['content'] = [
      { type: 'text', text: publicUrl }
    ];

    if (buffer.byteLength > IMAGE_INLINE_THRESHOLD) {
      // Image is too large to inline safely — store as temporary resource
      const resourceId = randomBytes(16).toString('hex');
      const resourceUri = `mapbox://temp/static-map-${resourceId}`;
      const base64Data = Buffer.from(buffer).toString('base64');
      temporaryResourceManager.create(
        resourceId,
        resourceUri,
        base64Data,
        { toolName: this.name, size: buffer.byteLength },
        undefined,
        mimeType
      );
      content.push({
        type: 'text',
        text: `⚠️ Image (${Math.round(buffer.byteLength / 1024)}KB) stored as temporary resource.\nResource URI: ${resourceUri}\nTTL: 30 minutes`
      });
    } else {
      // Image is small enough to inline as base64
      const base64Data = Buffer.from(buffer).toString('base64');
      content.push({ type: 'image', data: base64Data, mimeType });
    }

    // Conditionally add MCP-UI resource if enabled (backward compatibility)
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
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }
}
