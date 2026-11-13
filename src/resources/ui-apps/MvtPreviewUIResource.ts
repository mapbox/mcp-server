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
import { renderMvtPreviewHtml } from './mvtPreviewHtml.js';
import { mapAppCsp } from './mapAppCsp.js';

export const MVT_PREVIEW_URI = 'ui://mapbox/mvt-preview/index.html';

/** UI for `mvt_preview_tool`, the viewer for `.mvt` and `.pbf` files. */
export class MvtPreviewUIResource extends BaseResource {
  readonly name = 'Mapbox Vector Tile Viewer UI';
  readonly uri = MVT_PREVIEW_URI;
  readonly description =
    'Viewer for a Mapbox Vector Tile file: its layers, fields and features on a map (MCP Apps)';
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
          text: renderMvtPreviewHtml({ publicToken: publicToken ?? '' }),
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
