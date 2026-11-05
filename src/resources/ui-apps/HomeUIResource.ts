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
import { renderHomeAppHtml } from './homeAppHtml.js';

export const HOME_APP_URI = 'ui://mapbox/home/index.html';

/** Style thumbnails come from the Static Images API; nothing else is loaded. */
export function homeAppCsp(apiEndpoint: string): {
  resourceDomains: string[];
} {
  const resourceDomains = ['https://api.mapbox.com'];
  try {
    const origin = new URL(apiEndpoint).origin;
    if (!resourceDomains.includes(origin)) resourceDomains.push(origin);
  } catch {
    // An invalid endpoint can't serve thumbnails anyway.
  }
  return { resourceDomains };
}

/** UI for `mapbox_home_tool`, the Mapbox home page in ChatGPT's sidebar. */
export class HomeUIResource extends BaseResource {
  readonly name = 'Mapbox Home App UI';
  readonly uri = HOME_APP_URI;
  readonly description =
    "Lists the account's styles, tilesets and public tokens (MCP Apps)";
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

    // Only for style thumbnails; the page still works without one.
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
          text: renderHomeAppHtml({
            publicToken: publicToken ?? '',
            apiEndpoint: this.apiEndpoint()
          }),
          _meta: {
            ui: { csp: homeAppCsp(this.apiEndpoint()) },
            'openai/ui': {
              preferredDisplayMode: 'fullscreen',
              availableDisplayModes: ['fullscreen']
            }
          }
        }
      ]
    };
  }
}
