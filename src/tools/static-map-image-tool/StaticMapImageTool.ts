// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.input.schema.js';
import type { OverlaySchema } from './StaticMapImageTool.input.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import { getOwnerKeyFromToken } from '../../utils/jwtUtils.js';

// Images larger than this threshold are stored as temporary resources instead
// of being inlined as base64, to avoid exceeding Claude Desktop's 1MB tool
// result limit. base64 adds ~33% overhead, so 700KB raw ≈ 933KB encoded.
const IMAGE_INLINE_THRESHOLD = 700 * 1024; // 700KB

// encodeURIComponent leaves (, ), !, ', and * unescaped (they're valid in a
// URI component per RFC 3986's "unreserved" carve-out from the older
// escape() behaviour). Every overlay value below is embedded inside a
// path segment delimited by literal parentheses (e.g. `url-<value>(lon,lat)`,
// `geojson(<value>)`), so a raw `)` in the value can terminate that segment
// early from the Static Images API's own overlay-syntax parser's point of
// view, even though this value already passed URL/JSON validation on our
// side. Escape those characters explicitly so both parsers agree on where
// the value actually ends.
function encodeOverlayComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[()!'*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export class StaticMapImageTool extends MapboxApiBasedTool<
  typeof StaticMapImageInputSchema
> {
  name = 'static_map_image_tool';
  description =
    'Generates a static map image from Mapbox Static Images API. Supports center coordinates, zoom level (0-22), image size (up to 1280x1280), various Mapbox styles, and overlays (markers, paths, GeoJSON). Returns PNG for vector styles, JPEG for raster-only styles. Use only when the user explicitly asks for a static image file — to show a map, use render_map_tool instead, which renders an interactive map.';
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
        const encodedUrl = encodeOverlayComponent(overlay.url);
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
        return `${path}(${encodeOverlayComponent(overlay.encodedPolyline)})`;
      }

      case 'geojson': {
        const geojsonString = JSON.stringify(overlay.data);
        return `geojson(${encodeOverlayComponent(geojsonString)})`;
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

    const encodedStyle = input.style
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const baseUrl = `${MapboxApiBasedTool.mapboxApiEndpoint}styles/v1/${encodedStyle}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}`;

    // Fetch image
    let publicUrl = baseUrl + (input.highDensity ? '@2x' : '');
    const response = await this.httpRequest(
      `${publicUrl}?access_token=${accessToken}`
    );
    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }
    let buffer = await response.arrayBuffer();

    // A 2x image is about three times the bytes of the same map at 1x (a
    // 1000x800 streets map: 877KB vs 295KB). Rather than hand back a
    // temporary resource the host can't show (Codex showed no image at all),
    // try the 1x image, which usually fits inline.
    if (input.highDensity && buffer.byteLength > IMAGE_INLINE_THRESHOLD) {
      const fallback = await this.httpRequest(
        `${baseUrl}?access_token=${accessToken}`
      );
      if (fallback.ok) {
        const fallbackBuffer = await fallback.arrayBuffer();
        if (fallbackBuffer.byteLength < buffer.byteLength) {
          buffer = fallbackBuffer;
          publicUrl = baseUrl;
        }
      }
    }

    const isRasterStyle = input.style.includes('satellite');
    const mimeType = isRasterStyle ? 'image/jpeg' : 'image/png';

    // The URL has no access token (it would end up in the chat history), so
    // it returns 401 on its own. Hosts show the image from this result, but a
    // model can't put it in its own reply, so left with a bare URL it links
    // that instead (Codex did). Say so before the URL.
    const inline = buffer.byteLength <= IMAGE_INLINE_THRESHOLD;
    const describedSize = `${width}x${height}${publicUrl.endsWith('@2x') ? ' @2x' : ''}`;
    const urlNote = inline
      ? `Static map image (${describedSize}, ${input.style}) is attached to this result, which is where the host shows it to the user. ` +
        "Don't link or embed the request URL below: it has no access token, so it won't load for the user. " +
        'If they ask to see the map again, point them to this result or call this tool again.\n' +
        `Request URL: ${publicUrl}`
      : `Request URL (it has no access token, so don't link or embed it): ${publicUrl}`;
    const content: CallToolResult['content'] = [
      { type: 'text', text: urlNote }
    ];

    if (!inline) {
      // Image is too large to inline safely — store as temporary resource
      const resourceId = randomBytes(16).toString('hex');
      const resourceUri = `mapbox://temp/static-map-${resourceId}`;
      const base64Data = Buffer.from(buffer).toString('base64');
      temporaryResourceManager.create({
        id: resourceId,
        uri: resourceUri,
        data: base64Data,
        metadata: { toolName: this.name, size: buffer.byteLength },
        mimeType,
        owner: getOwnerKeyFromToken(accessToken)
      });
      content.push({
        type: 'text',
        text: `⚠️ Image (${Math.round(buffer.byteLength / 1024)}KB) stored as temporary resource.\nResource URI: ${resourceUri}\nTTL: 30 minutes`
      });
    } else {
      // Image is small enough to inline as base64
      const base64Data = Buffer.from(buffer).toString('base64');
      content.push({ type: 'image', data: base64Data, mimeType });
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
