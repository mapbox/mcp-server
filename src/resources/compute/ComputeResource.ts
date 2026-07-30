// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { resolveComputeRef } from '../../utils/computeRef.js';

/**
 * Resource for `mapbox://compute/...` refs — the stateless counterpart to
 * `mapbox://temp/...` (see `TemporaryDataResource`). These refs carry their
 * own inputs (base64 in the URI) rather than pointing at server-side
 * storage, so `read()` re-derives the result on every call instead of doing
 * a lookup. That makes it immune to server restarts and to horizontal
 * scaling — any process can resolve any ref — unlike the in-memory
 * `temporaryResourceManager` store `mapbox://temp/` depends on.
 */
export class ComputeResource extends BaseResource {
  readonly name = 'Computed Data';
  readonly uri = 'mapbox://compute/{spec}';
  readonly description =
    'Stateless computed map payloads (e.g. polygon operations) re-derived from the ref itself on every read.';
  readonly mimeType = 'application/json';

  async read(
    uri: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const payload = resolveComputeRef(uri);

    if (!payload) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Computed resource ref was malformed or unsupported.'
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
