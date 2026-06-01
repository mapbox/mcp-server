// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the map-matching MCP App HTML — used by both the MCP Apps resource
 * and the inline MCP-UI rawHtml block emitted by `map_matching_tool`.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface MapMatchingAppInitialData {
  raw_trace: { type: 'LineString'; coordinates: [number, number][] };
  matched_geometry: unknown; // GeoJSON LineString OR polyline string
  summary?: string;
}

export function renderMapMatchingAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: MapMatchingAppInitialData;
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
  #legend .swatch { display: inline-block; width: 18px; height: 0;
    border-top: 3px dashed #f97316; vertical-align: middle; margin-right: 6px; }
  #legend .matched { background: #3b82f6; height: 3px; border: 0; }
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
  <div><span class="swatch"></span>Raw GPS trace</div>
  <div><span class="swatch matched"></span>Matched route</div>
</div>
<div id="loading">Loading map matching…</div>
<div id="error" style="display:none"></div>
${initialDataScript}

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
    appInfo: { name: 'Map Matching Preview', version: '1.0.0' }
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
      if (pendingPayload) { drawMatching(pendingPayload); pendingPayload = null; }
      else { consumeInitialData(); }
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.raw_trace && data.matched_geometry) {
        var matched = normalizeGeometry(data.matched_geometry);
        if (matched) drawMatching({ raw_trace: data.raw_trace, matched_geometry: matched, summary: data.summary });
      }
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload) { renderPayload(payload); return; }
    showError('No map matching data in tool result.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawMatching(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function extractPayload(result) {
    var sc = result && result.structuredContent;
    // map_matching_tool returns the API response:
    //   { code, matchings: [{geometry, distance, duration, confidence}], tracepoints: [{location, ...}] }
    if (sc && Array.isArray(sc.matchings) && sc.matchings.length > 0 && Array.isArray(sc.tracepoints)) {
      var matching = sc.matchings[0];
      var matched = normalizeGeometry(matching.geometry);
      if (!matched) return null;
      // Reconstruct the raw trace from the input tracepoints
      var rawCoords = sc.tracepoints
        .filter(function(tp) { return tp && Array.isArray(tp.location); })
        .map(function(tp) { return tp.location; });
      if (rawCoords.length === 0) return null;
      var parts = [];
      if (typeof matching.distance === 'number') parts.push((matching.distance / 1609.34).toFixed(2) + ' mi');
      if (typeof matching.duration === 'number') parts.push(Math.round(matching.duration / 60) + ' min');
      var confidence = typeof matching.confidence === 'number' ? ' (confidence ' + (matching.confidence * 100).toFixed(0) + '%)' : '';
      return {
        raw_trace: { type: 'LineString', coordinates: rawCoords },
        matched_geometry: matched,
        summary: 'Matched trace: ' + (parts.length ? parts.join(', ') : 'unknown') + confidence
      };
    }
    return null;
  }

  function normalizeGeometry(g) {
    if (g && typeof g === 'object' && Array.isArray(g.coordinates) && g.coordinates.length) return g;
    if (typeof g === 'string' && g.length > 0) {
      var coords = decodePolyline(g, 5);
      if (coords.length > 0 && coordsLookSane(coords)) return { type: 'LineString', coordinates: coords };
      coords = decodePolyline(g, 6);
      if (coords.length > 0 && coordsLookSane(coords)) return { type: 'LineString', coordinates: coords };
    }
    return null;
  }
  function coordsLookSane(coords) {
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      if (!Array.isArray(c) || c.length !== 2) return false;
      if (c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90) return false;
    }
    return true;
  }
  function decodePolyline(str, precision) {
    precision = precision || 5;
    var factor = Math.pow(10, precision);
    var coords = [];
    var lat = 0, lng = 0, i = 0;
    while (i < str.length) {
      var shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0; result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lng / factor, lat / factor]);
    }
    return coords;
  }

  function drawMatching(payload) {
    ['matched-line', 'raw-line'].forEach(function(id) { if (map.getLayer(id)) map.removeLayer(id); });
    ['matched', 'raw'].forEach(function(id) { if (map.getSource(id)) map.removeSource(id); });

    map.addSource('raw', { type: 'geojson', data: { type: 'Feature', geometry: payload.raw_trace, properties: {} } });
    map.addLayer({
      id: 'raw-line', type: 'line', source: 'raw',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#f97316', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [2, 2] }
    });

    map.addSource('matched', { type: 'geojson', data: { type: 'Feature', geometry: payload.matched_geometry, properties: {} } });
    map.addLayer({
      id: 'matched-line', type: 'line', source: 'matched',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.9 }
    });

    legendEl.style.display = 'block';

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function ext(coords) {
      for (var i = 0; i < coords.length; i++) {
        var c = coords[i];
        if (c[0] < minLng) minLng = c[0]; if (c[1] < minLat) minLat = c[1];
        if (c[0] > maxLng) maxLng = c[0]; if (c[1] > maxLat) maxLat = c[1];
      }
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

function escapeForScript(s: string): string {
  return s.replace(/<\/script>/gi, '<\\/script>');
}

import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import type { HttpRequest } from '../../utils/types.js';

export async function tryRenderMapMatchingInlineHtml(params: {
  matching: {
    geometry?: unknown;
    distance?: number;
    duration?: number;
    confidence?: number;
  };
  rawTrace: Array<{ longitude: number; latitude: number }>;
  accessToken: string;
  apiEndpoint: string;
  httpRequest: HttpRequest;
}): Promise<string | undefined> {
  const { matching, rawTrace, accessToken, apiEndpoint, httpRequest } = params;
  if (!matching?.geometry || rawTrace.length < 2) return undefined;

  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  const parts: string[] = [];
  if (typeof matching.distance === 'number')
    parts.push(`${(matching.distance / 1609.34).toFixed(2)} mi`);
  if (typeof matching.duration === 'number')
    parts.push(`${Math.round(matching.duration / 60)} min`);
  const conf =
    typeof matching.confidence === 'number'
      ? ` (confidence ${(matching.confidence * 100).toFixed(0)}%)`
      : '';
  const summary = `Matched trace: ${parts.length ? parts.join(', ') : 'unknown'}${conf}`;

  return renderMapMatchingAppHtml({
    publicToken,
    initialData: {
      raw_trace: {
        type: 'LineString',
        coordinates: rawTrace.map(
          (p) => [p.longitude, p.latitude] as [number, number]
        )
      },
      matched_geometry: matching.geometry,
      summary
    }
  });
}
