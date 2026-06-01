// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the directions MCP App HTML.
 *
 * The same template is consumed by two ingress paths:
 *
 * 1. **MCP Apps spec** — `DirectionsAppUIResource` reads this resource at
 *    `ui://mapbox/directions-app/index.html`. The iframe loads, the agent's
 *    tool result is delivered via the `ui/notifications/tool-result`
 *    postMessage event, and `extractRoute()` pulls the route out of
 *    `structuredContent.routes[0]`.
 *
 * 2. **Legacy MCP-UI spec** — `directions_tool` inlines a `rawHtml`
 *    UIResource into its content array (gated by `isMcpUiEnabled()`). The
 *    HTML is generated at tool-execute time with the route geometry already
 *    baked in as an `initialData` script block, so the iframe renders
 *    immediately without needing the host to deliver the tool result.
 *
 * One source of truth for the rendering logic; two slim entry conditions.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface DirectionsAppInitialData {
  geometry: { type: string; coordinates: [number, number][] };
  summary?: string;
}

export function renderDirectionsAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: DirectionsAppInitialData;
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
${initialDataScript}

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

  // -------------------------------------------------------------------------
  // MCP App postMessage protocol (skipped silently in MCP-UI rawHtml mode)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Map init
  // -------------------------------------------------------------------------
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
      } else {
        consumeInitialData();
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }
  initMap();

  // -------------------------------------------------------------------------
  // Initial data path (MCP-UI rawHtml): geometry was baked in server-side.
  // -------------------------------------------------------------------------
  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.geometry && data.geometry.coordinates) {
        drawRoute(data);
      }
    } catch (_) { /* ignore */ }
  }

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
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawRoute(route);
    else pendingRoute = route;
  }

  function extractRoute(result) {
    var sc = result && result.structuredContent;
    if (sc && Array.isArray(sc.routes) && sc.routes.length > 0) {
      var r = sc.routes[0];
      if (r && r.geometry && r.geometry.coordinates) {
        return { geometry: r.geometry, summary: buildSummary(r) };
      }
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && Array.isArray(parsed.routes) && parsed.routes[0] && parsed.routes[0].geometry) {
              var r2 = parsed.routes[0];
              return { geometry: r2.geometry, summary: buildSummary(r2) };
            }
            if (parsed && parsed.geometry && parsed.geometry.coordinates) {
              return parsed;
            }
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  function buildSummary(route) {
    var parts = [];
    if (typeof route.distance === 'number') {
      parts.push((route.distance / 1609.34).toFixed(1) + ' mi');
    }
    if (typeof route.duration === 'number') {
      parts.push(Math.round(route.duration / 60) + ' min');
    }
    return parts.length ? 'Route: ' + parts.join(', ') : 'Route';
  }

  function drawRoute(route) {
    if (!route.geometry || !route.geometry.coordinates || !route.geometry.coordinates.length) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Route geometry is empty.';
      errorEl.style.display = 'block';
      return;
    }

    if (route.summary && summaryEl.style.display === 'none') {
      summaryEl.textContent = route.summary;
      summaryEl.style.display = 'block';
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
  // Prevent </script> inside JSON from breaking out of the script tag.
  return s.replace(/<\/script>/gi, '<\\/script>');
}
