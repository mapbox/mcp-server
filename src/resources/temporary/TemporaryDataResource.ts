// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';

/**
 * Resource for temporary data storage (large tool responses)
 */
export class TemporaryDataResource extends BaseResource {
  readonly name = 'Temporary Data';
  readonly uri = 'mapbox://temp/{id}';
  readonly description =
    'Temporary storage for large tool responses. Data expires after TTL.';
  readonly mimeType = 'application/json';

  async read(uri: string): Promise<ReadResourceResult> {
    const resource = temporaryResourceManager.get(uri);

    if (!resource) {
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'text/plain',
            text: 'Resource not found or expired. Temporary resources have a 30-minute TTL.'
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
