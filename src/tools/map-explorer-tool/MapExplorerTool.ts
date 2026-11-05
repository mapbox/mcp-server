// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import type { CallToolResult, Icon } from '@modelcontextprotocol/server';
import { BaseTool, type ToolMeta } from '../BaseTool.js';
import { mapAppCsp } from '../../resources/ui-apps/mapAppCsp.js';
import { MAP_APP_URI } from '../../resources/ui-apps/MapAppUIResource.js';
import { mapboxMarkIcon } from '../shared/mapboxMarkIcon.js';

const MapExplorerInputSchema = z.object({});

/**
 * `map_explorer_tool` — opens the map app with a place search box. ChatGPT
 * calls it with `{}` from the "Explore map" quick action on the Mapbox
 * sidebar entry (`mapbox_home_tool`), not from a model call.
 */
export class MapExplorerTool extends BaseTool<typeof MapExplorerInputSchema> {
  readonly name = 'map_explorer_tool';
  readonly description =
    'Open an interactive Mapbox map with a place search box for the user to explore on their own. ' +
    'Not for showing data: use render_map_tool to display places, routes or other results.';

  readonly annotations = {
    title: 'Mapbox Maps',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  readonly icons: Icon[] = [mapboxMarkIcon];

  readonly meta: ToolMeta;

  constructor(params: { apiEndpoint?: () => string } = {}) {
    super({ inputSchema: MapExplorerInputSchema });
    const apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
    this.meta = {
      ui: {
        resourceUri: MAP_APP_URI,
        visibility: ['app'],
        csp: mapAppCsp(apiEndpoint())
      }
    };
  }

  async run(): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: 'Opened the Mapbox map explorer.' }],
      // An empty payload renders the bare map; `explorer` makes the app
      // show its search box.
      structuredContent: {
        explorer: true,
        mapboxRender: { layers: [], markers: [] }
      }
    };
  }
}
