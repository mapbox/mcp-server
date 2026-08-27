// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { MapboxApiBasedTool } from '../../tools/MapboxApiBasedTool.js';
import { resolveInlineImageRef } from '../../utils/inlineImageRef.js';
import { StaticMapImageInputSchema } from '../../tools/static-map-image-tool/StaticMapImageTool.input.schema.js';
import {
  buildStaticMapRequestUrl,
  getStaticMapMimeType
} from '../../tools/static-map-image-tool/buildStaticMapRequestUrl.js';

/**
 * Resource for `mapbox://inline-image/{tool}?data=...` refs — see
 * inlineImageRef.ts for why this exists and why it works this way.
 *
 * Unlike the other `inline-*` resources, `read()` doesn't just unwrap the
 * ref: it re-issues the original Static Images API request with the ref's
 * own params and the reader's own resolved access token, and returns the
 * freshly fetched bytes. Nothing is kept in memory between the original
 * tool call and the read, so this works identically no matter which
 * process or hosted task serves the follow-up.
 */
export class InlineImageResource extends BaseResource {
  readonly name = 'Inline Image Response';
  readonly uri = 'mapbox://inline-image/{spec}';
  readonly description =
    "Stateless large static_map_image_tool response, re-fetched on demand from the ref's own request parameters.";
  readonly mimeType = 'application/octet-stream';

  private readonly httpRequest: HttpRequest;

  constructor(params: { httpRequest: HttpRequest }) {
    super();
    this.httpRequest = params.httpRequest;
  }

  async read(
    uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const malformed: ReadResourceResult = {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'Inline image ref was malformed.'
        }
      ]
    };

    const resolved = resolveInlineImageRef(uri);
    if (!resolved) return malformed;

    const accessToken =
      (extra?.authInfo?.token as string | undefined) ??
      MapboxApiBasedTool.mapboxAccessToken;
    if (!accessToken) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'No access token available to re-fetch this image. Provide a Bearer token or set MAPBOX_ACCESS_TOKEN.'
          }
        ]
      };
    }

    const parsedInput = StaticMapImageInputSchema.safeParse(resolved.params);
    if (!parsedInput.success) return malformed;

    const { url } = buildStaticMapRequestUrl(parsedInput.data, accessToken);
    const response = await this.httpRequest(url);
    if (!response.ok) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Failed to re-fetch image: ${response.status} ${response.statusText}`
          }
        ]
      };
    }

    const buffer = await response.arrayBuffer();
    const mimeType = getStaticMapMimeType(parsedInput.data.style);
    const base64Data = Buffer.from(buffer).toString('base64');

    return {
      contents: [{ uri, mimeType, blob: base64Data }]
    };
  }
}
