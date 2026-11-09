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
import { mapAppCsp, type MapAppCsp } from './mapAppCsp.js';

export const HOME_APP_URI = 'ui://mapbox/home/index.html';

/**
 * The map app's CSP (the style preview runs GL JS), plus the API endpoint as
 * an image source for Static Images thumbnails.
 */
export function homeAppCsp(apiEndpoint: string): MapAppCsp {
  const csp = mapAppCsp(apiEndpoint);
  try {
    const origin = new URL(apiEndpoint).origin;
    if (!csp.resourceDomains.includes(origin)) csp.resourceDomains.push(origin);
  } catch {
    // An invalid endpoint can't serve thumbnails anyway.
  }
  return csp;
}

/** UI for `mapbox_home_tool`, the Mapbox home page in ChatGPT's sidebar. */
export class HomeUIResource extends BaseResource {
  readonly name = 'Mapbox Home App UI';
  readonly uri = HOME_APP_URI;
  readonly description =
    "Mapbox home page: starter prompts and the account's styles, tilesets and public tokens (MCP Apps)";
  readonly mimeType = RESOURCE_MIME_TYPE;

  private readonly httpRequest: HttpRequest;
  private readonly apiEndpoint: () => string;
  private readonly pluginName: () => string | undefined;

  constructor(params: {
    httpRequest: HttpRequest;
    apiEndpoint?: () => string;
    pluginName?: () => string | undefined;
  }) {
    super();
    this.httpRequest = params.httpRequest;
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
    this.pluginName =
      params.pluginName ??
      (() => process.env.MAPBOX_CHATGPT_PLUGIN_NAME?.trim() || undefined);
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
            apiEndpoint: this.apiEndpoint(),
            pluginName: this.pluginName()
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
