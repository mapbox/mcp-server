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
import { renderMapAppHtml } from './mapAppHtml.js';

/**
 * Per-tool flavor of the generic Mapbox MCP App resource.
 *
 * The HTML body is identical across every instance — the only thing that
 * differs is the `uri`. We register one resource per tool (directions,
 * isochrone, optimization, search, category-search, map-matching,
 * ground-location, polygon-ops) so that when an LLM chains two tools in
 * one chat, each tool's result opens its own iframe in the host UI
 * instead of being deduplicated by URI (which collapses the earlier
 * tool's card and surfaces a misleading failure badge).
 */
export class MapAppUIResource extends BaseResource {
  readonly name: string;
  readonly uri: string;
  readonly description: string;
  readonly mimeType = RESOURCE_MIME_TYPE;

  private readonly httpRequest: HttpRequest;
  private readonly apiEndpoint: () => string;

  constructor(params: {
    httpRequest: HttpRequest;
    apiEndpoint?: () => string;
    /** Suffix that disambiguates this flavor (e.g. `directions`, `search`). */
    flavor?: string;
  }) {
    super();
    this.httpRequest = params.httpRequest;
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
    const flavor = params.flavor;
    this.uri = flavor
      ? `ui://mapbox/map-app/${flavor}/index.html`
      : 'ui://mapbox/map-app/index.html';
    this.name = flavor ? `Mapbox Map App UI (${flavor})` : 'Mapbox Map App UI';
    this.description = flavor
      ? `Generic Mapbox GL JS renderer for ${flavor}_tool results (MCP Apps)`
      : 'Generic Mapbox GL JS renderer for tool results that include a map payload (MCP Apps)';
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

    const html = renderMapAppHtml({ publicToken: publicToken ?? '' });

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

/**
 * Flavors registered in the resource registry, one per tool that emits a
 * map payload. Each value is the suffix used in the URI and the field that
 * a tool reads via `MAP_APP_URI.<flavor>` when declaring `meta.ui.resourceUri`.
 */
export const MAP_APP_FLAVORS = [
  'directions',
  'isochrone',
  'optimization',
  'search',
  'category-search',
  'map-matching',
  'ground-location',
  'polygon-ops'
] as const;
export type MapAppFlavor = (typeof MAP_APP_FLAVORS)[number];

export const MAP_APP_URI: Record<MapAppFlavor, string> = MAP_APP_FLAVORS.reduce(
  (acc, flavor) => {
    acc[flavor] = `ui://mapbox/map-app/${flavor}/index.html`;
    return acc;
  },
  {} as Record<MapAppFlavor, string>
);
