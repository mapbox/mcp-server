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

/**
 * Serves UI App HTML for Static Map Preview
 * Implements MCP Apps pattern with ui:// scheme
 */
export class StaticMapUIResource extends BaseResource {
  readonly name = 'Static Map Preview UI';
  readonly uri = 'ui://mapbox/static-map/index.html';
  readonly description =
    'Interactive UI for previewing static map images (MCP Apps)';
  readonly mimeType = RESOURCE_MIME_TYPE;

  async read(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _uri: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    // Generate HTML for static map visualization with MCP Apps protocol support
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Static Map Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #toolbar {
      display: none;
      align-items: center;
      justify-content: flex-end;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.7);
      gap: 8px;
    }
    #toolbar.visible { display: flex; }
    #fullscreen-btn {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #fff;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    #fullscreen-btn:hover { background: rgba(255, 255, 255, 0.25); }
    #image-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      position: relative;
    }
    #preview-image {
      max-width: 100%;
      max-height: 100%;
      display: none;
      cursor: zoom-in;
    }
    #preview-image.zoomed {
      cursor: zoom-out;
      max-width: none;
      max-height: none;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-size: 16px;
    }
    #error {
      padding: 20px;
      color: #ff6b6b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="fullscreen-btn">&#x26F6; Fullscreen</button>
  </div>
  <div id="image-container">
    <div id="loading">Loading static map preview...</div>
    <img id="preview-image" alt="Static Map Preview">
    <div id="error" style="display:none"></div>
  </div>

  <script type="module">
    const image = document.getElementById('preview-image');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const toolbar = document.getElementById('toolbar');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    let isZoomed = false;
    let currentDisplayMode = 'inline';
    let canFullscreen = false;

    image.addEventListener('click', () => {
      isZoomed = !isZoomed;
      image.classList.toggle('zoomed', isZoomed);
    });

    let messageId = 0;
    const pendingRequests = new Map();

    function sendRequest(method, params = {}) {
      const id = ++messageId;
      window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
      });
    }

    function sendNotification(method, params = {}) {
      window.parent.postMessage({ jsonrpc: '2.0', method, params }, '*');
    }

    function requestSizeToFit() {
      if (currentDisplayMode !== 'inline') return;
      sendNotification('ui/notifications/size-changed', {
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    }

    function updateFullscreenButton() {
      fullscreenBtn.textContent =
        currentDisplayMode === 'fullscreen'
          ? '&#x229F; Exit Fullscreen'
          : '&#x26F6; Fullscreen';
    }

    async function toggleFullscreen() {
      const newMode = currentDisplayMode === 'fullscreen' ? 'inline' : 'fullscreen';
      try {
        const result = await sendRequest('ui/request-display-mode', { mode: newMode });
        currentDisplayMode = result?.mode ?? newMode;
        updateFullscreenButton();
        if (currentDisplayMode === 'inline') requestSizeToFit();
      } catch (e) {
        console.error('Failed to change display mode:', e);
      }
    }

    fullscreenBtn.addEventListener('click', toggleFullscreen);

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.id !== undefined && pendingRequests.has(message.id)) {
        const { resolve, reject } = pendingRequests.get(message.id);
        pendingRequests.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }

      if (message.method === 'ui/notifications/tool-result') {
        if (message.params) handleToolResult(message.params);
      }

      if (message.method === 'ui/notifications/host-context-changed') {
        const ctx = message.params;
        if (ctx?.displayMode) {
          currentDisplayMode = ctx.displayMode;
          updateFullscreenButton();
          if (currentDisplayMode === 'inline' && image.style.display !== 'none') {
            requestSizeToFit();
          }
        }
      }
    });

    async function handleToolResult(result) {
      const textContent = result.content?.find(c => c.type === 'text');
      if (!textContent?.text) {
        loading.style.display = 'none';
        errorDiv.textContent = 'No URL found in tool result';
        errorDiv.style.display = 'block';
        return;
      }

      const url = textContent.text;
      if (!url.includes('api.mapbox.com/styles/') || !url.includes('/static/')) {
        loading.style.display = 'none';
        errorDiv.textContent = 'Unsupported URL format';
        errorDiv.style.display = 'block';
        return;
      }

      loading.textContent = 'Fetching map from Mapbox...';
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        image.onload = () => {
          loading.style.display = 'none';
          image.style.display = 'block';
          if (canFullscreen) toolbar.classList.add('visible');
          requestSizeToFit();
        };
        image.src = blobUrl;
      } catch (error) {
        loading.style.display = 'none';
        errorDiv.textContent = 'Failed to load image: ' + error.message;
        errorDiv.style.display = 'block';
      }
    }

    async function init() {
      try {
        const result = await sendRequest('ui/initialize', {
          protocolVersion: '2026-01-26',
          appCapabilities: {},
          appInfo: { name: 'Static Map Preview', version: '1.0.0' }
        });

        sendNotification('ui/notifications/initialized', {});

        const hostContext = result?.hostContext;
        currentDisplayMode = hostContext?.displayMode ?? 'inline';
        canFullscreen = hostContext?.availableDisplayModes?.includes('fullscreen') ?? false;
      } catch (error) {
        console.error('Failed to connect to MCP host:', error);
        loading.textContent = 'Failed to connect: ' + error.message;
        loading.style.color = '#cc0000';
      }
    }

    init();
  </script>
</body>
</html>`;

    return {
      contents: [
        {
          uri: this.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: ['https://api.mapbox.com'],
                resourceDomains: ['https://api.mapbox.com']
              }
            }
          }
        }
      ]
    };
  }
}
