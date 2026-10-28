// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.input.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { buildResponseRef } from '../../utils/responseRef.js';
import {
  buildStaticMapRequestUrl,
  getStaticMapMimeType
} from './buildStaticMapRequestUrl.js';

// Images larger than this threshold get a `mapbox://response/` ref instead
// of being inlined as base64, to avoid exceeding Claude Desktop's 1MB tool
// result limit. base64 adds ~33% overhead, so 700KB raw ≈ 933KB encoded.
const IMAGE_INLINE_THRESHOLD = 700 * 1024; // 700KB

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

  protected async execute(
    input: z.infer<typeof StaticMapImageInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const { publicUrl, url } = buildStaticMapRequestUrl({
      input,
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

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
    const mimeType = getStaticMapMimeType(input.style);

    // Use public URL (without credentials) to avoid leaking the access token
    const content: CallToolResult['content'] = [
      { type: 'text', text: publicUrl }
    ];

    if (buffer.byteLength > IMAGE_INLINE_THRESHOLD) {
      // Image is too large to inline safely. The ref carries the request's
      // inputs, not the image, so any server process can answer a later
      // read by rendering it again (see responseRef.ts).
      const resourceUri = buildResponseRef({ tool: 'static-map', input });
      content.push({
        type: 'text',
        text: `⚠️ Image (${Math.round(buffer.byteLength / 1024)}KB) is too large to return inline.\nRead ${resourceUri} with the MCP resource API to get it. Reading it renders the same image again.`
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
