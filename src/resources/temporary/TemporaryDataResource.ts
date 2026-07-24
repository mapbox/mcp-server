// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';

/**
 * Resource for temporary data storage (large tool responses).
 * Serves JSON text for structured data and binary blobs for image data.
 */
export class TemporaryDataResource extends BaseResource {
  readonly name = 'Temporary Data';
  readonly uri = 'mapbox://temp/{id}';
  readonly description =
    'Temporary storage for large tool responses. Data expires after TTL.';
  readonly mimeType = 'application/json';

  async read(
    uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const notFound: ReadResourceResult = {
      contents: [
        {
          uri: uri,
          mimeType: 'text/plain',
          text: 'Resource not found or expired. Temporary resources have a 30-minute TTL.'
        }
      ]
    };

    const resource = temporaryResourceManager.get(uri);

    if (!resource) {
      return notFound;
    }

    // Enforce per-account ownership: only the account that created the resource
    // may read it. Resolve the requester the same way tools resolve their token
    // (request auth first, then the env token). A mismatch returns the SAME
    // "not found" response as a missing resource, so a caller cannot probe
    // whether someone else's resource exists.
    //
    // The env-token fallback is for stdio/single-user mode only. In hosted
    // multi-tenant deployments MAPBOX_ACCESS_TOKEN is NOT set and every request
    // carries its own bearer token via authInfo; the request token therefore
    // always wins and the env fallback never applies cross-tenant. Do not set a
    // shared MAPBOX_ACCESS_TOKEN in a multi-tenant deployment or all env-less
    // reads would resolve to that one account.
    const requesterToken =
      (extra?.authInfo?.token as string | undefined) ??
      process.env.MAPBOX_ACCESS_TOKEN;
    const requester = requesterToken
      ? getUserNameFromToken(requesterToken)
      : undefined;
    if (!resource.owner || !requester || resource.owner !== requester) {
      return notFound;
    }

    // For image data, return as blob
    if (resource.mimeType?.startsWith('image/')) {
      return {
        contents: [
          {
            uri,
            mimeType: resource.mimeType,
            blob: resource.data as string
          }
        ]
      };
    }

    return {
      contents: [
        {
          uri: uri,
          mimeType: this.mimeType,
          text: JSON.stringify(resource.data, null, 2)
        }
      ]
    };
  }
}
