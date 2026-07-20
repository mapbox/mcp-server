// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { BaseResource } from '../BaseResource.js';
import type { HttpRequest } from '../../utils/types.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderDirectionsAppHtml } from './directionsAppHtml.js';

/**
 * MCP Apps resource for `directions_tool` — serves the HTML at
 * `ui://mapbox/directions-app/index.html`. The iframe waits for the host to
 * deliver the tool result via the `ui/notifications/tool-result` postMessage
 * event and renders the route from `structuredContent.routes[0]`.
 *
 * The legacy MCP-UI pathway (inline `rawHtml` on the tool result) uses the
 * same HTML template via `renderDirectionsAppHtml` with the call's input
 * params baked in at tool-execute time; the iframe self-fetches the route
 * from the Directions API using those params.
 */
export class DirectionsAppUIResource extends BaseResource {
  readonly name = 'Directions App UI';
  readonly uri = 'ui://mapbox/directions-app/index.html';
  readonly description =
    'Interactive UI for visualizing a Mapbox directions route with Mapbox GL JS (MCP Apps)';
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

  async read(
    _uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const accessToken =
      (extra?.authInfo?.token as string | undefined) ||
      process.env.MAPBOX_ACCESS_TOKEN ||
      '';

    const publicToken = await resolveMapboxPublicToken({
      accessToken,
      apiEndpoint: this.apiEndpoint(),
      httpRequest: this.httpRequest
    });

    const html = renderDirectionsAppHtml({
      publicToken: publicToken ?? '',
      apiEndpoint: this.apiEndpoint()
    });

    return {
      contents: [
        {
          uri: this.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [
                  'https://*.mapbox.com',
                  'https://events.mapbox.com'
                ],
                resourceDomains: ['https://api.mapbox.com'],
                workerDomains: ['blob:']
              },
              preferredSize: { width: 1000, height: 600 }
            }
          }
        }
      ]
    };
  }
}
