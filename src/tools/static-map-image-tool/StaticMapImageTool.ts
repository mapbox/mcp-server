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
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import {
  getUiCapability,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import {
  STATIC_MAP_VIEWER_URI,
  staticMapViewerCsp
} from '../../resources/ui-apps/StaticMapViewerUIResource.js';

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

  // MCP Apps hosts show the image at full width in this viewer instead of as
  // a thumbnail. The result is the same either way, so hosts without MCP
  // Apps still get the image item and the link.
  readonly meta = {
    ui: {
      resourceUri: STATIC_MAP_VIEWER_URI,
      csp: staticMapViewerCsp(MapboxApiBasedTool.mapboxApiEndpoint)
    }
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
    const { width, height } = input.size;
    const apiEndpoint = MapboxApiBasedTool.mapboxApiEndpoint;
    // The input the returned image was rendered from: the 1x fallback below
    // swaps it, so a mapbox://response/ ref renders the same image again.
    let rendered = input;
    const requested = buildStaticMapRequestUrl({
      input,
      accessToken,
      apiEndpoint
    });
    let publicUrl = requested.publicUrl;

    // Fetch image
    const response = await this.httpRequest(requested.url);
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
    // resource ref the host can't show (Codex showed no image at all),
    // try the 1x image, which usually fits inline.
    if (input.highDensity && buffer.byteLength > IMAGE_INLINE_THRESHOLD) {
      const oneX = { ...input, highDensity: false };
      const fallbackUrls = buildStaticMapRequestUrl({
        input: oneX,
        accessToken,
        apiEndpoint
      });
      const fallback = await this.httpRequest(fallbackUrls.url);
      if (fallback.ok) {
        const fallbackBuffer = await fallback.arrayBuffer();
        if (fallbackBuffer.byteLength < buffer.byteLength) {
          buffer = fallbackBuffer;
          rendered = oneX;
          publicUrl = fallbackUrls.publicUrl;
        }
      }
    }

    const mimeType = getStaticMapMimeType(input.style);

    // Hosts show the image from this result, but a model can't put it in its
    // own reply, so it hands the user a URL instead or says "the map above"
    // over nothing (Codex did both). Give it a link that works: the request
    // URL with a public (pk.) token, never the
    // access token used for the fetch (#201). The server's own
    // MAPBOX_PUBLIC_TOKEN is only used when the caller runs on the server's
    // own access token (a local install), so a hosted caller never gets it
    // in their chat history. With no public token, say not to link the URL.
    const inline = buffer.byteLength <= IMAGE_INLINE_THRESHOLD;
    const publicToken = await resolveMapboxPublicToken({
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
      httpRequest: this.httpRequest,
      allowEnvFallback: accessToken === MapboxApiBasedTool.mapboxAccessToken
    });
    const describedSize = `${width}x${height}${publicUrl.endsWith('@2x') ? ' @2x' : ''}`;
    const attached = `Static map image (${describedSize}, ${input.style}) is attached to this result, which is where the host shows it to the user. `;
    // A client that supports MCP Apps shows the image at full size in the
    // viewer (see StaticMapViewerUIResource), so a link in the reply would
    // show it twice. Clients that don't say so (or a stateless server that
    // never saw their initialize) get the link text.
    const imageUrl = publicToken
      ? `${publicUrl}?access_token=${publicToken}`
      : undefined;
    const showsViewer =
      (inline || imageUrl !== undefined) &&
      getUiCapability(
        this.activeServer?.server.getClientCapabilities()
      )?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true;
    const urlNote = showsViewer
      ? `Static map image (${describedSize}, ${input.style}) is shown to the user at full size in this tool's map viewer, so don't embed or link it again in your reply.` +
        (imageUrl
          ? `\nIf the user asks for a link to the image, use this URL; it carries the account's public token: ${imageUrl}`
          : '')
      : imageUrl
        ? (inline
            ? attached + "Your reply can't include that attachment, and "
            : 'The image is not attached, and ') +
          // Neither Claude's UI nor Codex renders images from other domains
          // in a reply (both left a broken image), so ask for a link.
          "chat interfaces generally don't show images from external URLs, so don't embed this URL as a Markdown image. " +
          "Give it as a link instead; it carries the account's public token, so it opens in a browser.\n" +
          `Image URL: ${imageUrl}`
        : inline
          ? attached +
            "Don't link or embed the request URL below: it has no access token, so it won't load for the user. " +
            'If they ask to see the map again, point them to this result or call this tool again.\n' +
            `Request URL: ${publicUrl}`
          : `Request URL (it has no access token, so don't link or embed it): ${publicUrl}`;
    const content: CallToolResult['content'] = [
      { type: 'text', text: urlNote }
    ];
    // Say so when the 1x fallback replaced the @2x image the caller asked
    // for, so the model can tell the user. Its own item, so the first one
    // still starts with the size (the viewer's alt text).
    if (rendered !== input) {
      content.push({
        type: 'text',
        text: 'The @2x image was too large to send, so this is the 1x image. For @2x, call this tool again with a smaller size.'
      });
    }

    if (!inline) {
      // Image is too large to inline safely. The ref carries the request's
      // inputs, not the image, so any server process can answer a later
      // read by rendering it again (see responseRef.ts).
      const resourceUri = buildResponseRef({
        tool: 'static-map',
        input: rendered
      });
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
