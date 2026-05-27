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
 * Serves the HTML for the Optimization App MCP App.
 *
 * Receives an optimized trip (route geometry + ordered stops) from
 * `optimization_app_tool` via the MCP Apps postMessage protocol, draws the
 * route as a line, and places numbered markers (1, 2, 3, …) at each stop in
 * the visit order so the user can see "do these in this order" at a glance.
 */
export class OptimizationAppUIResource extends BaseResource {
  readonly name = 'Optimization App UI';
  readonly uri = 'ui://mapbox/optimization-app/index.html';
  readonly description =
    'Interactive UI for visualizing an optimized multi-stop trip with Mapbox GL JS (MCP Apps)';
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

    const html = renderOptimizationAppHtml({
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

function renderOptimizationAppHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Optimized Trip</title>
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
    white-space: pre-line;
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
  .stop-marker {
    width: 28px; height: 28px; border-radius: 50%;
    background: #2563eb; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: pointer;
  }
  .stop-marker.start { background: #22c55e; }
  .stop-marker.end   { background: #ef4444; }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="loading">Loading optimized trip…</div>
<div id="error" style="display:none"></div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(publicToken)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');

  var map = null;
  var mapLoaded = false;
  var pendingPayload = null;
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
    appInfo: { name: 'Optimized Trip', version: '1.0.0' }
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
      if (pendingPayload) {
        drawTrip(pendingPayload);
        pendingPayload = null;
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }

  initMap();

  // ---------------------------------------------------------------------------
  // Tool result handler
  // ---------------------------------------------------------------------------
  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (!payload) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Could not find trip data in tool result.';
      errorEl.style.display = 'block';
      return;
    }

    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }

    if (!map) {
      loadingEl.style.display = 'none';
      return;
    }
    if (mapLoaded) {
      drawTrip(payload);
    } else {
      pendingPayload = payload;
    }
  }

  function extractPayload(result) {
    if (result && result.structuredContent && result.structuredContent.optimization) {
      return result.structuredContent.optimization;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.geometry && parsed.stops) return parsed;
            if (parsed && parsed.optimization && parsed.optimization.geometry) return parsed.optimization;
          } catch (_) {
            // not JSON, keep looking
          }
        }
      }
    }
    return null;
  }

  function drawTrip(payload) {
    var geom = payload.geometry;
    var stops = payload.stops || [];
    if (!geom || !geom.coordinates || !geom.coordinates.length || stops.length === 0) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Trip has no geometry or stops.';
      errorEl.style.display = 'block';
      return;
    }

    if (map.getLayer('trip-line')) map.removeLayer('trip-line');
    if (map.getSource('trip')) map.removeSource('trip');

    map.addSource('trip', {
      type: 'geojson',
      data: { type: 'Feature', geometry: geom, properties: {} }
    });
    map.addLayer({
      id: 'trip-line',
      type: 'line',
      source: 'trip',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 }
    });

    // Place numbered markers in optimized order
    stops.forEach(function(stop, idx) {
      var el = document.createElement('div');
      el.className = 'stop-marker';
      if (idx === 0) el.classList.add('start');
      else if (idx === stops.length - 1 && !payload.roundtrip) el.classList.add('end');
      el.textContent = String(stop.order);

      new mapboxgl.Marker({ element: el })
        .setLngLat(stop.location)
        .setPopup(
          new mapboxgl.Popup().setText(
            'Stop ' + stop.order + (stop.name ? ' — ' + stop.name : '') +
            ' (input #' + stop.input_index + ')'
          )
        )
        .addTo(map);
    });

    // Fit camera to all stops + route
    var lngs = geom.coordinates.map(function(c) { return c[0]; });
    var lats = geom.coordinates.map(function(c) { return c[1]; });
    var bounds = [
      [Math.min.apply(null, lngs), Math.min.apply(null, lats)],
      [Math.max.apply(null, lngs), Math.max.apply(null, lats)]
    ];
    map.fitBounds(bounds, {
      padding: { top: 70, bottom: 30, left: 30, right: 30 },
      duration: 600
    });

    loadingEl.style.display = 'none';
    requestSizeToFit();
  }
})();
</script>
</body>
</html>`;
}
