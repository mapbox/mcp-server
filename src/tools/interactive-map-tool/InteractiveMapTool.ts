// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import type {
  McpServer,
  RegisteredTool
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { InteractiveMapInputSchema } from './InteractiveMapTool.input.schema.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { UI_HTML_PATH } from './uiHtmlPath.js';

const RESOURCE_URI = 'ui://mapbox/interactive-map';
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

export class InteractiveMapTool extends MapboxApiBasedTool<
  typeof InteractiveMapInputSchema
> {
  name = 'interactive_map_tool';
  description =
    'Opens an interactive Mapbox GL JS map in the client. Call this ONCE — the map has its own search bar so the user can search for places directly without additional tool calls. Optionally pass initial center, zoom, style, and markers.';
  annotations = {
    title: 'Interactive Map',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: InteractiveMapInputSchema,
      httpRequest: params.httpRequest
    });
  }

  /**
   * Override installTo() to register both the UI resource and the tool.
   * Both registrations are gated behind isMcpUiEnabled().
   */
  installTo(server: McpServer): RegisteredTool {
    if (!isMcpUiEnabled()) {
      // Interactive map requires MCP UI — skip registration entirely
      this.server = server;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return {} as any;
    }

    this.server = server;

    // 1. Register the UI resource
    server.registerResource(
      RESOURCE_URI,
      RESOURCE_URI,
      {
        title: 'Interactive Map',
        description:
          'Interactive Mapbox GL JS map view with markers and popups',
        mimeType: RESOURCE_MIME_TYPE
      },
      async () => {
        let html = await readFile(UI_HTML_PATH, 'utf-8');

        // Inject the access token into the HTML
        const accessToken = MapboxApiBasedTool.mapboxAccessToken;
        if (accessToken) {
          html = html.replace('__MAPBOX_ACCESS_TOKEN__', accessToken);
        }

        return {
          contents: [
            {
              uri: RESOURCE_URI,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
              _meta: {
                ui: {
                  csp: {
                    connectDomains: [
                      'https://api.mapbox.com',
                      'https://*.tiles.mapbox.com',
                      'https://events.mapbox.com'
                    ],
                    resourceDomains: [
                      'https://api.mapbox.com',
                      'https://*.tiles.mapbox.com'
                    ]
                  }
                }
              }
            }
          ]
        };
      }
    );

    // 2. Register the tool with UI metadata linking to the resource
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputShape = (this.inputSchema as any).shape;

    return server.registerTool(
      this.name,
      {
        title: this.annotations.title,
        description: this.description,
        inputSchema: inputShape,
        annotations: this.annotations,
        _meta: {
          ui: { resourceUri: RESOURCE_URI },
          'ui/resourceUri': RESOURCE_URI
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any, extra: any) => this.run(args, extra)
    );
  }

  protected async execute(
    input: z.infer<typeof InteractiveMapInputSchema>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _accessToken: string
  ): Promise<CallToolResult> {
    const { center, zoom, style, markers } = input;

    const parts = [
      'Interactive map displayed.',
      `Center: ${center.latitude}, ${center.longitude}`,
      `Zoom: ${zoom}`,
      `Style: ${style}`
    ];

    if (markers && markers.length > 0) {
      parts.push(`Markers: ${markers.length}`);
      markers.forEach((m, i) => {
        parts.push(
          `  ${i + 1}. ${m.label || `(${m.latitude}, ${m.longitude})`}`
        );
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: parts.join('\n')
        }
      ]
    };
  }
}
