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

const MAPBOX_GL_VERSION = '3.12.0';

/**
 * Serves the HTML for the Directions App MCP App.
 *
 * The HTML implements the MCP Apps postMessage protocol: on initialize it
 * receives the tool result via `ui/notifications/tool-result`, extracts the
 * route GeoJSON from the structured content, and renders it on a live Mapbox
 * GL JS map.
 *
 * A short-lived public (`pk.*`) Mapbox token is resolved server-side and baked
 * into the response so the iframe never sees the customer's `sk.*` token.
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
      glVersion: MAPBOX_GL_VERSION
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

function renderDirectionsAppHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Directions Preview</title>
<link href="https://api.mapbox.com/mapbox-gl-js/v${glVersion}/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v${glVersion}/mapbox-gl.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #map { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  #summary {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.88); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    max-width: calc(100% - 24px);
  }
  #loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #666; font-size: 16px; z-index: 10; pointer-events: none;
  }
  #error {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #d32f2f; background: #ffebee; border-radius: 8px;
    padding: 20px; max-width: 400px; text-align: center; z-index: 10;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="loading">Loading directions…</div>
<div id="error" style="display:none"></div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(publicToken)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');

  var map = null;
  var mapLoaded = false;
  var pendingRoute = null;
  var currentDisplayMode = 'inline';

  // ---------------------------------------------------------------------------
  // MCP App postMessage protocol
  // ---------------------------------------------------------------------------
  var messageId = 0;
  var pendingRequests = new Map();

  function sendRequest(method, params) {
    var id = ++messageId;
    window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
    return new Promise(function(resolve, reject) {
      pendingRequests.set(id, { resolve: resolve, reject: reject });
    });
  }

  function sendNotification(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
  }

  function requestSizeToFit() {
    if (currentDisplayMode !== 'inline') return;
    sendNotification('ui/notifications/size-changed', { height: 500 });
  }

  window.addEventListener('message', function(event) {
    var message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.id !== undefined && pendingRequests.has(message.id)) {
      var handlers = pendingRequests.get(message.id);
      pendingRequests.delete(message.id);
      if (message.error) handlers.reject(new Error(message.error.message));
      else handlers.resolve(message.result);
      return;
    }

    if (message.method === 'ui/notifications/tool-result' && message.params) {
      handleToolResult(message.params);
    }

    if (message.method === 'ui/notifications/host-context-changed' && message.params) {
      var ctx = message.params;
      if (ctx.displayMode) {
        currentDisplayMode = ctx.displayMode;
        if (map) setTimeout(function() { map.resize(); }, 100);
      }
    }
  });

  sendRequest('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Directions Preview', version: '1.0.0' }
  }).then(function() {
    sendNotification('ui/notifications/initialized', {});
  }, function() {
    sendNotification('ui/notifications/initialized', {});
  });

  // ---------------------------------------------------------------------------
  // Map initialization
  // ---------------------------------------------------------------------------
  function initMap() {
    if (!TOKEN) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No Mapbox public token available. Set MAPBOX_PUBLIC_TOKEN or grant tokens:read to the OAuth client.';
      errorEl.style.display = 'block';
      return;
    }
    if (typeof mapboxgl === 'undefined') {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Mapbox GL JS failed to load.';
      errorEl.style.display = 'block';
      return;
    }

    mapboxgl.accessToken = TOKEN;
    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [0, 20],
      zoom: 1.5
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.on('load', function() {
      mapLoaded = true;
      if (pendingRoute) {
        drawRoute(pendingRoute);
        pendingRoute = null;
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }

  initMap();

  // ---------------------------------------------------------------------------
  // Tool result handler — pulls route data from the tool's structuredContent
  // ---------------------------------------------------------------------------
  function handleToolResult(result) {
    var route = extractRoute(result);
    if (!route) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Could not find route data in tool result.';
      errorEl.style.display = 'block';
      return;
    }

    if (route.summary) {
      summaryEl.textContent = route.summary;
      summaryEl.style.display = 'block';
    }

    if (!map) {
      loadingEl.style.display = 'none';
      return;
    }
    if (mapLoaded) {
      drawRoute(route);
    } else {
      pendingRoute = route;
    }
  }

  function extractRoute(result) {
    // Preferred: structuredContent.route = { geometry, summary }
    if (result && result.structuredContent && result.structuredContent.route) {
      return result.structuredContent.route;
    }
    // Fallback: a text content block that JSON-encodes the route
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.geometry && parsed.geometry.coordinates) {
              return parsed;
            }
            if (parsed && parsed.route && parsed.route.geometry) {
              return parsed.route;
            }
          } catch (_) {
            // not JSON, keep looking
          }
        }
      }
    }
    return null;
  }

  function drawRoute(route) {
    if (!route.geometry || !route.geometry.coordinates || !route.geometry.coordinates.length) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Route geometry is empty.';
      errorEl.style.display = 'block';
      return;
    }

    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');

    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: route.geometry, properties: {} }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 }
    });

    var coords = route.geometry.coordinates;
    new mapboxgl.Marker({ color: '#22c55e' })
      .setLngLat(coords[0])
      .setPopup(new mapboxgl.Popup().setText('Start'))
      .addTo(map);
    new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat(coords[coords.length - 1])
      .setPopup(new mapboxgl.Popup().setText('End'))
      .addTo(map);

    var lngs = coords.map(function(c) { return c[0]; });
    var lats = coords.map(function(c) { return c[1]; });
    var bounds = [
      [Math.min.apply(null, lngs), Math.min.apply(null, lats)],
      [Math.max.apply(null, lngs), Math.max.apply(null, lats)]
    ];
    map.fitBounds(bounds, { padding: 60, duration: 600 });

    loadingEl.style.display = 'none';
    requestSizeToFit();
  }
})();
</script>
</body>
</html>`;
}
