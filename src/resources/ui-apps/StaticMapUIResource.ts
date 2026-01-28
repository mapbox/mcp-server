// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseResource } from '../BaseResource.js';

/**
 * Serves UI App HTML for Static Map Preview
 * Implements MCP Apps pattern with ui:// scheme
 */
export class StaticMapUIResource extends BaseResource {
  readonly name = 'Static Map Preview UI';
  readonly uri = 'ui://mapbox/static-map/*';
  readonly description =
    'Interactive UI for previewing static map images (MCP Apps)';
  readonly mimeType = 'text/html';

  public async read(uri: string): Promise<ReadResourceResult> {
    // Parse URI to extract style and position
    // Format: ui://mapbox/static-map/{style}/{lng},{lat},{zoom}
    const parsedUri = new URL(uri);
    const pathParts = parsedUri.pathname.split('/').filter((p) => p);
    const style = pathParts[2];
    const position = pathParts[3];

    if (!style || !position) {
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'text/plain',
            text: 'Error: Invalid URI format. Expected ui://mapbox/static-map/{style}/{lng},{lat},{zoom}'
          }
        ]
      };
    }

    // Generate HTML with embedded iframe for static map
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Static Map Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    #preview-frame {
      width: 100vw;
      height: 100vh;
      border: none;
      display: block;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #666;
    }
  </style>
</head>
<body>
  <div id="loading">Loading static map preview...</div>
  <iframe id="preview-frame" style="display:none"></iframe>

  <script type="module">
    // MCP Apps pattern: Extract parameters from tool result
    const style = '${style}';
    const position = '${position}';

    // For now, show a message that the preview URL is needed from the host
    document.addEventListener('DOMContentLoaded', () => {
      const frame = document.getElementById('preview-frame');
      const loading = document.getElementById('loading');

      loading.textContent = 'Static map preview requires access token from host';
      loading.style.color = '#0066cc';

      // TODO: Integrate @modelcontextprotocol/ext-apps SDK
      // import { App } from "@modelcontextprotocol/ext-apps";
      // const app = new App();
      // await app.connect();
      // app.ontoolresult = (result) => {
      //   if (result.imageUrl) {
      //     frame.src = result.imageUrl;
      //     frame.style.display = 'block';
      //     loading.style.display = 'none';
      //   }
      // };
    });
  </script>
</body>
</html>`;

    return {
      contents: [
        {
          uri: uri,
          mimeType: 'text/html',
          text: html
        }
      ]
    };
  }
}
