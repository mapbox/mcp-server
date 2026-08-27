// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { resolveInlineResponseRef } from '../../utils/inlineResponseRef.js';

/**
 * Resource for `mapbox://inline-response/{tool}?data=...` refs — the
 * self-describing counterpart to `mapbox://temp/` for a tool's own full
 * response, once it's too large to return inline in the tool result
 * itself (see inlineResponseRef.ts for why this exists). `read()` unwraps
 * the data straight out of the URI instead of doing a store lookup, so
 * it's immune to which of the hosted deployment's stateless tasks handles
 * the request.
 */
export class InlineResponseResource extends BaseResource {
  readonly name = 'Inline Tool Response';
  readonly uri = 'mapbox://inline-response/{spec}';
  readonly description =
    "Stateless self-describing full tool response, resolved directly from the ref's own contents.";
  readonly mimeType = 'application/json';

  async read(
    uri: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const data = resolveInlineResponseRef(uri);

    if (data === null) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Inline response ref was malformed.'
          }
        ]
      };
    }

    return {
      contents: [
        {
          uri,
          mimeType: this.mimeType,
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
}
