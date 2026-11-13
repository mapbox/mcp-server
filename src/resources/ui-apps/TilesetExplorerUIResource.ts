// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type {
  ReadResourceResult,
  ServerContext
} from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { BaseResource } from '../BaseResource.js';
import type { HttpRequest } from '../../utils/types.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderTilesetExplorerHtml } from './tilesetExplorerHtml.js';
import { mapAppCsp } from './mapAppCsp.js';

export const TILESET_EXPLORER_URI = 'ui://mapbox/tileset-explorer/index.html';

/** UI for `tileset_explorer_tool`. */
export class TilesetExplorerUIResource extends BaseResource {
  readonly name = 'Mapbox Tileset Explorer UI';
  readonly uri = TILESET_EXPLORER_URI;
  readonly description =
    "Interactive preview of a Mapbox tileset's tiles, source layers and features (MCP Apps)";
  readonly mimeType = RESOURCE_MIME_TYPE;

  private readonly httpRequest: HttpRequest;
  private readonly apiEndpoint: () => string;

  constructor(params: {
    httpRequest: HttpRequest;
    apiEndpoint?: () => string;
  }) {
    super();
    this.httpRequest = params.httpRequest;
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
  }

  async read(_uri: string, extra?: ServerContext): Promise<ReadResourceResult> {
    const accessToken =
      (extra?.http?.authInfo?.token as string | undefined) ||
      process.env.MAPBOX_ACCESS_TOKEN ||
      '';

    const publicToken = accessToken
      ? await resolveMapboxPublicToken({
          accessToken,
          apiEndpoint: this.apiEndpoint(),
          httpRequest: this.httpRequest
        })
      : undefined;

    return {
      contents: [
        {
          uri: this.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: renderTilesetExplorerHtml({ publicToken: publicToken ?? '' }),
          _meta: {
            ui: {
              csp: mapAppCsp(this.apiEndpoint()),
              preferredSize: { width: 1000, height: 600 }
            },
            'openai/ui': {
              preferredDisplayMode: 'fullscreen',
              availableDisplayModes: ['inline', 'fullscreen']
            }
          }
        }
      ]
    };
  }
}
