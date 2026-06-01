// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the polygon-operation MCP App HTML — used by both the MCP Apps
 * resource and the inline MCP-UI rawHtml block emitted by `union_tool`,
 * `intersect_tool`, and `difference_tool`.
 *
 * MCP Apps path: only the result geometry is in the tool's structuredContent
 * (inputs come from the request, not the response). The iframe shows the
 * result polygon in the operation color.
 *
 * MCP-UI path: the tool bakes both inputs + result into initialData, so the
 * iframe shows inputs in muted blue and the result in the operation color.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export type PolygonOperation = 'union' | 'intersect' | 'difference';

export interface PolygonOpsAppInitialData {
  operation: PolygonOperation;
  inputs: Array<{ type: 'Feature'; geometry: unknown }>;
  result: { type: 'Feature'; geometry: unknown } | null;
  summary?: string;
}

export function renderPolygonOpsAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: PolygonOpsAppInitialData;
}): string {
  const { publicToken, initialData } = params;
  const glVersion = params.glVersion ?? MAPBOX_GL_VERSION;

  const initialDataScript = initialData
    ? `<script id="initial-data" type="application/json">${escapeForScript(
        JSON.stringify(initialData)
      )}</script>`
    : '';

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
    font-size: 11px; display: none;
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
  <div id="inputs-legend" style="display:none"><span class="swatch" style="background:#3b82f6;opacity:0.35"></span>Inputs</div>
  <div id="result-legend" style="display:none"><span class="swatch" id="result-swatch"></span><span id="result-label">Result</span></div>
</div>
<div id="loading">Loading…</div>
<div id="error" style="display:none"></div>
${initialDataScript}

<script>
(function() {
  var TOKEN = ${JSON.stringify(publicToken)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');
  var legendEl = document.getElementById('legend');
  var inputsLegendEl = document.getElementById('inputs-legend');
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
    try { window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*'); } catch (_) {}
    return new Promise(function(resolve, reject) {
      pendingRequests.set(id, { resolve: resolve, reject: reject });
    });
  }
  function sendNotification(method, params) {
    try { window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*'); } catch (_) {}
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
  }).then(function() { sendNotification('ui/notifications/initialized', {}); },
         function() { sendNotification('ui/notifications/initialized', {}); });

  function initMap() {
    if (!TOKEN) { showError('No Mapbox public token available.'); return; }
    if (typeof mapboxgl === 'undefined') { showError('Mapbox GL JS failed to load.'); return; }
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
      if (pendingPayload) { draw(pendingPayload); pendingPayload = null; }
      else { consumeInitialData(); }
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.operation) draw(data);
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload) { renderPayload(payload); return; }
    showError('No polygon data in tool result.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) draw(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  // The three offline polygon-op tools return structuredContent =
  //   { geometry: <Polygon|MultiPolygon|null>, type: 'Polygon'|'MultiPolygon'|null }
  // Inputs aren't in the response (they came from the request), so the
  // MCP Apps path shows only the result polygon.
  function extractPayload(result) {
    var sc = result && result.structuredContent;
    if (sc && sc.geometry && typeof sc.geometry === 'object') {
      return {
        operation: 'union', // best-guess; result color defaults to green
        inputs: [],
        result: { type: 'Feature', geometry: sc.geometry, properties: {} }
      };
    }
    return null;
  }

  var RESULT_COLORS = {
    union: '#22c55e',     // green
    intersect: '#8b5cf6', // purple
    difference: '#f97316' // orange
  };

  var trackedLayers = [];
  var trackedSources = [];

  function draw(payload) {
    var op = payload.operation || 'union';
    var resultColor = RESULT_COLORS[op] || '#22c55e';

    trackedLayers.forEach(function(id) { if (map.getLayer(id)) map.removeLayer(id); });
    trackedSources.forEach(function(id) { if (map.getSource(id)) map.removeSource(id); });
    trackedLayers = [];
    trackedSources = [];

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0]; if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0]; if (c[1] > maxLat) maxLat = c[1];
    }
    function walkCoords(coords) {
      if (typeof coords[0] === 'number') extend(coords);
      else for (var i = 0; i < coords.length; i++) walkCoords(coords[i]);
    }

    var inputs = Array.isArray(payload.inputs) ? payload.inputs : [];
    inputs.forEach(function(feature, i) {
      if (!feature || !feature.geometry) return;
      var sid = 'poly-input-' + i;
      var fid = 'input-fill-' + i;
      var lid = 'input-line-' + i;
      map.addSource(sid, { type: 'geojson', data: feature });
      map.addLayer({
        id: fid, type: 'fill', source: sid,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.25 }
      });
      map.addLayer({
        id: lid, type: 'line', source: sid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.7 }
      });
      trackedSources.push(sid);
      trackedLayers.push(fid, lid);
      walkCoords(feature.geometry.coordinates);
    });

    if (inputs.length > 0) inputsLegendEl.style.display = 'block';

    if (payload.result && payload.result.geometry) {
      map.addSource('poly-result', { type: 'geojson', data: payload.result });
      map.addLayer({
        id: 'result-fill', type: 'fill', source: 'poly-result',
        paint: { 'fill-color': resultColor, 'fill-opacity': 0.45 }
      });
      map.addLayer({
        id: 'result-line', type: 'line', source: 'poly-result',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': resultColor, 'line-width': 3 }
      });
      trackedSources.push('poly-result');
      trackedLayers.push('result-fill', 'result-line');
      walkCoords(payload.result.geometry.coordinates);

      resultSwatchEl.style.background = resultColor;
      resultSwatchEl.style.opacity = '0.7';
      resultLabelEl.textContent = op + ' result';
      resultLegendEl.style.display = 'block';
    }

    legendEl.style.display = 'block';

    loadingEl.style.display = 'none';
    requestSizeToFit();

    if (isFinite(minLng)) {
      setTimeout(function() {
        map.resize();
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: { top: 70, bottom: 50, left: 30, right: 30 },
          duration: 600
        });
      }, 60);
    }
  }
})();
</script>
</body>
</html>`;
}

function escapeForScript(s: string): string {
  return s.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Bake polygon op inputs + result into the shared iframe template for
 * MCP-UI clients. Polygon ops are fully offline tools (no API calls and
 * no per-request access token), so the public token must come from the
 * MAPBOX_PUBLIC_TOKEN env var. If it isn't set, no inline UI is emitted.
 */
export function tryRenderPolygonOpsInlineHtml(params: {
  operation: PolygonOperation;
  inputs: Array<{ type: 'Feature'; geometry: unknown }>;
  result: { type: 'Feature'; geometry: unknown } | null;
  summary: string;
}): string | undefined {
  const { operation, inputs, result, summary } = params;

  if (inputs.length === 0) return undefined;

  const publicToken = process.env.MAPBOX_PUBLIC_TOKEN;
  if (!publicToken || !publicToken.startsWith('pk.')) return undefined;

  return renderPolygonOpsAppHtml({
    publicToken,
    initialData: { operation, inputs, result, summary }
  });
}
