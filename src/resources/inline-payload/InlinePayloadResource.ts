// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { resolveInlinePayloadRef } from '../../utils/inlinePayloadRef.js';

/**
 * Resource for `mapbox://inline/payload?data=...` refs — `render_map_tool`'s
 * self-describing merged-output ref (see inlinePayloadRef.ts). Like
 * `ComputeResource`, `read()` unwraps the payload straight out of the URI
 * instead of doing a store lookup, so it's immune to server restarts.
 */
export class InlinePayloadResource extends BaseResource {
  readonly name = 'Inline Rendered Payload';
  readonly uri = 'mapbox://inline/{spec}';
  readonly description =
    "Stateless self-describing render_map_tool output, resolved directly from the ref's own contents.";
  readonly mimeType = 'application/json';

  async read(
    uri: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const payload = resolveInlinePayloadRef(uri);

    if (!payload) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Inline payload ref was malformed.'
          }
        ]
      };
    }

    return {
      contents: [
        {
          uri,
          mimeType: this.mimeType,
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }
}
