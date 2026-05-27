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
 * Serves the HTML for the Map Matching App MCP App.
 *
 * Receives a raw GPS trace and the snapped matched geometry from
 * `map_matching_app_tool`, draws the raw trace as a dashed orange line,
 * the matched route as a solid blue line on top, and fits the camera to both.
 */
export class MapMatchingAppUIResource extends BaseResource {
  readonly name = 'Map Matching App UI';
  readonly uri = 'ui://mapbox/map-matching-app/index.html';
  readonly description =
    'Interactive UI for visualizing raw GPS traces snapped to the road network (MCP Apps)';
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

    const html = renderMapMatchingAppHtml({
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

function renderMapMatchingAppHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Map Matching Preview</title>
<link href="https://api.mapbox.com/mapbox-gl-js/v${glVersion}/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v${glVersion}/mapbox-gl.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #map { position: absolute; inset: 0; }
  #summary {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.88); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    max-width: calc(100% - 24px);
  }
  #legend {
    position: absolute; bottom: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.88); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 11px;
    display: none;
  }
  #legend .swatch {
    display: inline-block; width: 18px; height: 3px; vertical-align: middle;
    margin-right: 6px;
  }
  #legend .raw { background: #f97316; border-top: 1px dashed #f97316; background: repeating-linear-gradient(90deg,#f97316 0 6px,transparent 6px 10px); height: 0; border-top: 3px dashed #f97316; }
  #legend .matched { background: #3b82f6; }
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
<div id="legend">
  <div><span class="swatch raw"></span>Raw GPS trace</div>
  <div><span class="swatch matched"></span>Matched route</div>
</div>
<div id="loading">Loading map matching…</div>
<div id="error" style="display:none"></div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(publicToken)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');
  var legendEl = document.getElementById('legend');

  var map = null;
  var mapLoaded = false;
  var pendingPayload = null;
  var currentDisplayMode = 'inline';

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
    if (message.method === 'ui/notifications/host-context-changed' && message.params && message.params.displayMode) {
      currentDisplayMode = message.params.displayMode;
      if (map) setTimeout(function() { map.resize(); }, 100);
    }
  });

  sendRequest('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Map Matching Preview', version: '1.0.0' }
  }).then(function() {
    sendNotification('ui/notifications/initialized', {});
  }, function() {
    sendNotification('ui/notifications/initialized', {});
  });

  function initMap() {
    if (!TOKEN) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No Mapbox public token available.';
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
        drawMatching(pendingPayload);
        pendingPayload = null;
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }
  initMap();

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (!payload || !payload.matched_geometry || !payload.raw_trace) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No map matching data in tool result.';
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
      drawMatching(payload);
    } else {
      pendingPayload = payload;
    }
  }

  function extractPayload(result) {
    if (result && result.structuredContent && result.structuredContent.map_matching) {
      return result.structuredContent.map_matching;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.matched_geometry && parsed.raw_trace) return parsed;
            if (parsed && parsed.map_matching && parsed.map_matching.matched_geometry) {
              return parsed.map_matching;
            }
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  function drawMatching(payload) {
    ['matched-line', 'raw-line'].forEach(function(id) {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['matched', 'raw'].forEach(function(id) {
      if (map.getSource(id)) map.removeSource(id);
    });

    map.addSource('raw', {
      type: 'geojson',
      data: { type: 'Feature', geometry: payload.raw_trace, properties: {} }
    });
    map.addLayer({
      id: 'raw-line',
      type: 'line',
      source: 'raw',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#f97316',
        'line-width': 3,
        'line-opacity': 0.85,
        'line-dasharray': [2, 2]
      }
    });

    map.addSource('matched', {
      type: 'geojson',
      data: { type: 'Feature', geometry: payload.matched_geometry, properties: {} }
    });
    map.addLayer({
      id: 'matched-line',
      type: 'line',
      source: 'matched',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.9 }
    });

    legendEl.style.display = 'block';

    // Fit camera to combined bounds of both lines
    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function ext(coords) {
      coords.forEach(function(c) {
        if (c[0] < minLng) minLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] > maxLat) maxLat = c[1];
      });
    }
    ext(payload.raw_trace.coordinates);
    ext(payload.matched_geometry.coordinates);

    loadingEl.style.display = 'none';
    requestSizeToFit();
    setTimeout(function() {
      map.resize();
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: { top: 70, bottom: 50, left: 30, right: 30 },
        duration: 600
      });
    }, 60);
  }
})();
</script>
</body>
</html>`;
}
