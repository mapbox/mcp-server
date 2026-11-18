// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ReadResourceResult } from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { BaseResource } from '../BaseResource.js';
import { renderStaticMapViewerHtml } from './staticMapViewerHtml.js';

export const STATIC_MAP_VIEWER_URI = 'ui://mapbox/static-map/index.html';

/**
 * The MCP App `static_map_image_tool` points at, which shows its image at
 * full width (see staticMapViewerHtml.ts).
 *
 * The image comes from the tool result itself, so unlike the map app this
 * page needs no token. Its CSP only allows images from the API origin, for
 * the public-token URL it falls back to when the image went to a temporary
 * resource.
 */
export class StaticMapViewerUIResource extends BaseResource {
  readonly name = 'Mapbox Static Map Viewer';
  readonly uri = STATIC_MAP_VIEWER_URI;
  readonly description =
    'Shows the static_map_image_tool image at full width (MCP Apps)';
  readonly mimeType = RESOURCE_MIME_TYPE;

  private readonly apiEndpoint: () => string;

  constructor(params: { apiEndpoint?: () => string } = {}) {
    super();
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
  }

  async read(): Promise<ReadResourceResult> {
    return {
      contents: [
        {
          uri: this.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: renderStaticMapViewerHtml({ apiEndpoint: this.apiEndpoint() }),
          _meta: {
            ui: {
              csp: staticMapViewerCsp(this.apiEndpoint()),
              prefersBorder: false
            }
          }
        }
      ]
    };
  }
}

/** Images from the API origin only; the page fetches nothing else. */
export function staticMapViewerCsp(apiEndpoint: string): {
  resourceDomains: string[];
} {
  const resourceDomains = ['https://api.mapbox.com'];
  try {
    const origin = new URL(apiEndpoint).origin;
    if (!resourceDomains.includes(origin)) resourceDomains.push(origin);
  } catch {
    // An endpoint that isn't a valid URL can't serve images anyway.
  }
  return { resourceDomains };
}
