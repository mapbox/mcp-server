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
 * Serves HTML for union/intersect/difference polygon-op MCP Apps.
 *
 * The input polygons are rendered in muted blue (semi-transparent fill +
 * outline) and the result polygon is overlaid in a brighter color keyed to
 * the operation (green=union, purple=intersect, orange=difference).
 */
export class PolygonOpsAppUIResource extends BaseResource {
  readonly name = 'Polygon Ops App UI';
  readonly uri = 'ui://mapbox/polygon-ops-app/index.html';
  readonly description =
    'Interactive UI for visualizing polygon union/intersect/difference results (MCP Apps)';
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

    const html = renderHtml({
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

function renderHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polygon Operation</title>
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
  }
  #legend {
    position: absolute; bottom: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.88); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 11px;
    display: none;
  }
  #legend .swatch {
    display: inline-block; width: 14px; height: 14px;
    vertical-align: middle; margin-right: 6px; border-radius: 3px;
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
<div id="legend">
  <div><span class="swatch" style="background:#3b82f6;opacity:0.35"></span>Inputs</div>
  <div id="result-legend" style="display:none"><span class="swatch" id="result-swatch"></span><span id="result-label">Result</span></div>
</div>
<div id="loading">Loading…</div>
<div id="error" style="display:none"></div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(publicToken)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');
  var legendEl = document.getElementById('legend');
  var resultLegendEl = document.getElementById('result-legend');
  var resultSwatchEl = document.getElementById('result-swatch');
  var resultLabelEl = document.getElementById('result-label');

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
    appInfo: { name: 'Polygon Operation', version: '1.0.0' }
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
        draw(pendingPayload);
        pendingPayload = null;
      }
    });
  }
  initMap();

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (!payload || !Array.isArray(payload.inputs) || payload.inputs.length === 0) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No polygon data in tool result.';
      errorEl.style.display = 'block';
      return;
    }
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) draw(payload);
    else pendingPayload = payload;
  }

  function extractPayload(result) {
    if (result && result.structuredContent && result.structuredContent.polygon_ops) {
      return result.structuredContent.polygon_ops;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && Array.isArray(parsed.inputs)) return parsed;
            if (parsed && parsed.polygon_ops && Array.isArray(parsed.polygon_ops.inputs)) {
              return parsed.polygon_ops;
            }
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  var RESULT_COLORS = {
    union: '#22c55e',     // green
    intersect: '#8b5cf6', // purple
    difference: '#f97316' // orange
  };

  function draw(payload) {
    var op = payload.operation;
    var resultColor = RESULT_COLORS[op] || '#22c55e';

    // Clean up any prior layers/sources
    ['result-fill', 'result-line'].forEach(function(id) {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    payload.inputs.forEach(function(_, i) {
      var fid = 'input-fill-' + i;
      var lid = 'input-line-' + i;
      if (map.getLayer(fid)) map.removeLayer(fid);
      if (map.getLayer(lid)) map.removeLayer(lid);
    });
    var existingSources = (map.getStyle().sources || {});
    Object.keys(existingSources).forEach(function(s) {
      if (s.indexOf('poly-') === 0) map.removeSource(s);
    });

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }
    function walkCoords(coords) {
      if (typeof coords[0] === 'number') {
        extend(coords);
      } else {
        for (var i = 0; i < coords.length; i++) walkCoords(coords[i]);
      }
    }

    // Render input polygons (muted blue)
    payload.inputs.forEach(function(feature, i) {
      var sid = 'poly-input-' + i;
      map.addSource(sid, { type: 'geojson', data: feature });
      map.addLayer({
        id: 'input-fill-' + i,
        type: 'fill',
        source: sid,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.25 }
      });
      map.addLayer({
        id: 'input-line-' + i,
        type: 'line',
        source: sid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.7 }
      });
      if (feature.geometry) walkCoords(feature.geometry.coordinates);
    });

    // Render result polygon if present
    if (payload.result && payload.result.geometry) {
      map.addSource('poly-result', { type: 'geojson', data: payload.result });
      map.addLayer({
        id: 'result-fill',
        type: 'fill',
        source: 'poly-result',
        paint: { 'fill-color': resultColor, 'fill-opacity': 0.45 }
      });
      map.addLayer({
        id: 'result-line',
        type: 'line',
        source: 'poly-result',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': resultColor, 'line-width': 3 }
      });
      walkCoords(payload.result.geometry.coordinates);

      resultSwatchEl.style.background = resultColor;
      resultSwatchEl.style.opacity = '0.7';
      resultLabelEl.textContent = op + ' result';
      resultLegendEl.style.display = 'block';
    }

    legendEl.style.display = 'block';

    if (isFinite(minLng)) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: { top: 70, bottom: 50, left: 30, right: 30 },
        duration: 600
      });
    }

    loadingEl.style.display = 'none';
    requestSizeToFit();
  }
})();
</script>
</body>
</html>`;
}
