// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseResource } from '../BaseResource.js';
import { getVersionInfo } from '../../utils/versionUtils.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Resource exposing MCP server version information.
 *
 * Available URI:
 * - mapbox://version
 */
export class VersionResource extends BaseResource {
  readonly uri = 'mapbox://version';
  readonly name = 'Mapbox MCP Server Version';
  readonly description =
    'Version information for the Mapbox MCP server, including version number, git SHA, tag, and branch.';
  readonly mimeType = 'application/json';

  async read(): Promise<ReadResourceResult> {
    const info = getVersionInfo();
    return {
      contents: [
        {
          uri: this.uri,
          mimeType: 'application/json',
          text: JSON.stringify(info, null, 2)
        }
      ]
    };
  }
}
