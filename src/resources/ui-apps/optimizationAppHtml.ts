// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the optimized-trip MCP App HTML — used by both the MCP Apps resource
 * and `optimization_tool`'s inline MCP-UI rawHtml block.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface OptimizationAppInitialData {
  geometry: unknown; // GeoJSON LineString OR encoded polyline string
  stops: Array<{
    order: number;
    input_index: number;
    location: [number, number];
    name?: string;
  }>;
  roundtrip?: boolean;
  summary?: string;
}

export function renderOptimizationAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: OptimizationAppInitialData;
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
${initialDataScript}

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
  var stopMarkers = [];

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
    appInfo: { name: 'Optimized Trip', version: '1.0.0' }
  }).then(function() { sendNotification('ui/notifications/initialized', {}); },
         function() { sendNotification('ui/notifications/initialized', {}); });

  function initMap() {
    if (!TOKEN) {
      showError('No Mapbox public token available. Set MAPBOX_PUBLIC_TOKEN or grant tokens:read to the OAuth client.');
      return;
    }
    if (typeof mapboxgl === 'undefined') {
      showError('Mapbox GL JS failed to load.');
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
      } else {
        consumeInitialData();
      }
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.geometry && Array.isArray(data.stops)) {
        var normalized = normalizeGeometry(data.geometry);
        if (normalized) drawTrip({ geometry: normalized, stops: data.stops, roundtrip: data.roundtrip, summary: data.summary });
      }
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload) {
      renderPayload(payload);
      return;
    }
    showError('Could not find trip data in tool result.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawTrip(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function extractPayload(result) {
    var sc = result && result.structuredContent;
    // optimization_tool returns OptimizationOutput: { code, trips: [{geometry, distance, duration}], waypoints: [...] }
    if (sc && Array.isArray(sc.trips) && sc.trips.length > 0 && Array.isArray(sc.waypoints)) {
      var trip = sc.trips[0];
      if (trip && trip.geometry) {
        var geom = normalizeGeometry(trip.geometry);
        if (geom) {
          return {
            geometry: geom,
            stops: buildStops(sc.waypoints),
            summary: buildOptSummary(trip, sc.waypoints)
          };
        }
      }
    }
    // Legacy app-tool payload shape
    if (sc && sc.optimization && sc.optimization.geometry) {
      var legacy = sc.optimization;
      var g = normalizeGeometry(legacy.geometry);
      if (g) {
        return { geometry: g, stops: legacy.stops || [], roundtrip: legacy.roundtrip, summary: legacy.summary };
      }
    }
    return null;
  }

  function buildStops(waypoints) {
    // Sort by waypoint_index = position in optimized trip, then assign visit order
    return waypoints
      .map(function(wp, inputIndex) { return { wp: wp, inputIndex: inputIndex }; })
      .sort(function(a, b) { return a.wp.waypoint_index - b.wp.waypoint_index; })
      .map(function(entry, orderIndex) {
        return {
          order: orderIndex + 1,
          input_index: entry.inputIndex,
          location: entry.wp.location,
          name: entry.wp.name
        };
      });
  }

  function buildOptSummary(trip, waypoints) {
    var parts = [];
    if (typeof trip.distance === 'number') {
      parts.push((trip.distance / 1609.34).toFixed(1) + ' mi');
    }
    if (typeof trip.duration === 'number') {
      parts.push(Math.round(trip.duration / 60) + ' min');
    }
    return 'Optimized trip: ' + (parts.length ? parts.join(', ') : (waypoints.length + ' stops'));
  }

  // Accept GeoJSON LineString or encoded polyline (precision 5 or 6) — normalize to GeoJSON.
  function normalizeGeometry(g) {
    if (g && typeof g === 'object' && Array.isArray(g.coordinates) && g.coordinates.length) {
      return g;
    }
    if (typeof g === 'string' && g.length > 0) {
      var coords = decodePolyline(g, 5);
      if (coords.length > 0 && coordsLookSane(coords)) {
        return { type: 'LineString', coordinates: coords };
      }
      coords = decodePolyline(g, 6);
      if (coords.length > 0 && coordsLookSane(coords)) {
        return { type: 'LineString', coordinates: coords };
      }
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

  function drawTrip(payload) {
    var geom = payload.geometry;
    var stops = payload.stops || [];
    if (!geom || !geom.coordinates || !geom.coordinates.length || stops.length === 0) {
      showError('Trip has no geometry or stops.');
      return;
    }

    if (map.getLayer('trip-line')) map.removeLayer('trip-line');
    if (map.getSource('trip')) map.removeSource('trip');
    for (var mi = 0; mi < stopMarkers.length; mi++) stopMarkers[mi].remove();
    stopMarkers = [];

    map.addSource('trip', {
      type: 'geojson',
      data: { type: 'Feature', geometry: geom, properties: {} }
    });
    map.addLayer({
      id: 'trip-line', type: 'line', source: 'trip',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 }
    });

    stops.forEach(function(stop, idx) {
      // The iframe accepts tool-result from any postMessage source, so guard
      // against malformed payloads where stop.location is missing or not a
      // [lng, lat] pair — otherwise setLngLat throws mid-loop and leaves the
      // UI half-rendered. Skip the bad entry and keep going.
      if (!Array.isArray(stop.location) || stop.location.length < 2 ||
          typeof stop.location[0] !== 'number' ||
          typeof stop.location[1] !== 'number') {
        return;
      }
      var el = document.createElement('div');
      el.className = 'stop-marker';
      if (idx === 0) el.classList.add('start');
      else if (idx === stops.length - 1 && !payload.roundtrip) el.classList.add('end');
      el.textContent = String(stop.order);

      // The Mapbox Optimization API populates waypoint.name with the road
      // name the input coordinate was snapped to (not a place name), so
      // label it as "on <road>" to avoid implying we identified a place.
      var label = 'Stop ' + stop.order + ' (input #' + stop.input_index + ')';
      if (stop.name) label += ' — on ' + stop.name;

      stopMarkers.push(
        new mapboxgl.Marker({ element: el })
          .setLngLat(stop.location)
          .setPopup(new mapboxgl.Popup().setText(label))
          .addTo(map)
      );
    });

    var lngs = geom.coordinates.map(function(c) { return c[0]; });
    var lats = geom.coordinates.map(function(c) { return c[1]; });
    var bounds = [
      [Math.min.apply(null, lngs), Math.min.apply(null, lats)],
      [Math.max.apply(null, lngs), Math.max.apply(null, lats)]
    ];

    loadingEl.style.display = 'none';
    requestSizeToFit();
    setTimeout(function() {
      map.resize();
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 30, left: 30, right: 30 },
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
