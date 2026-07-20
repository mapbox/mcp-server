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
 *    HTML is generated at tool-execute time with the call's input params
 *    baked in as an `initialData` script block; the iframe uses those params
 *    to self-fetch the route from the Directions API, so it never depends on
 *    the host delivering the tool result.
 *
 * One source of truth for the rendering logic; two slim entry conditions.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface DirectionsAppInitialParams {
  coordinates: { longitude: number; latitude: number }[];
  routing_profile?: string;
  alternatives?: boolean;
  exclude?: string;
  depart_at?: string;
  arrive_by?: string;
  max_height?: number;
  max_width?: number;
  max_weight?: number;
}

export interface DirectionsAppInitialData {
  params: DirectionsAppInitialParams;
}

export function renderDirectionsAppHtml(params: {
  publicToken: string;
  apiEndpoint: string;
  glVersion?: string;
  initialData?: DirectionsAppInitialData;
}): string {
  const { publicToken, apiEndpoint, initialData } = params;
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
  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};

  var loadingEl = document.getElementById('loading');
  var errorEl = document.getElementById('error');
  var summaryEl = document.getElementById('summary');

  var map = null;
  var mapLoaded = false;
  var pendingRoute = null;
  var currentDisplayMode = 'inline';
  // Track markers across re-renders so we can remove them before drawing the
  // next route — otherwise a second tool-result delivery stacks pins.
  var routeMarkers = [];
  var routeRendered = false;
  var selfFetchStarted = false;

  // -------------------------------------------------------------------------
  // Self-fetch: build a Directions API request directly from the tool call's
  // input parameters and fetch the route ourselves, so this map never
  // depends on the tool response carrying geometries="geojson".
  //
  // Mirrors src/tools/directions-tool/buildDirectionsRequestUrl.ts — kept in
  // sync by the parity test in
  // test/tools/directions-tool/directionsUrlParity.test.ts. Always forces
  // geometries=geojson regardless of what the tool call itself requested.
  // -------------------------------------------------------------------------
  function formatIsoDateTimeClient(dateTime) {
    var noTzWithSeconds = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$/;
    if (noTzWithSeconds.test(dateTime)) {
      return dateTime.substring(0, dateTime.lastIndexOf(':'));
    }
    return dateTime;
  }

  function encodeExcludeClient(value) {
    return value
      .replace(/,/g, '%2C')
      .replace(/\\(/g, '%28')
      .replace(/\\)/g, '%29')
      .replace(/ /g, '%20');
  }

  function buildDirectionsApiUrl(params, publicToken, apiEndpoint) {
    var coords = params.coordinates
      .map(function(c) { return c.longitude + ',' + c.latitude; })
      .join(';');
    var encodedCoords = encodeURIComponent(coords);
    var profile = params.routing_profile || 'mapbox/driving-traffic';

    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    qp.append('geometries', 'geojson');
    qp.append('alternatives', params.alternatives ? 'true' : 'false');
    qp.append(
      'annotations',
      profile === 'mapbox/driving-traffic'
        ? 'distance,congestion,speed'
        : 'distance,speed'
    );
    qp.append('overview', 'full');

    if (params.depart_at) {
      qp.append('depart_at', formatIsoDateTimeClient(params.depart_at));
    } else if (params.arrive_by) {
      qp.append('arrive_by', formatIsoDateTimeClient(params.arrive_by));
    }
    if (params.max_height !== undefined && params.max_height !== null) {
      qp.append('max_height', String(params.max_height));
    }
    if (params.max_width !== undefined && params.max_width !== null) {
      qp.append('max_width', String(params.max_width));
    }
    if (params.max_weight !== undefined && params.max_weight !== null) {
      qp.append('max_weight', String(params.max_weight));
    }
    qp.append('steps', 'true');

    var queryString = qp.toString();
    if (params.exclude) {
      queryString += '&exclude=' + encodeExcludeClient(params.exclude);
    }

    return apiEndpoint + 'directions/v5/' + profile + '/' + encodedCoords + '?' + queryString;
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildDirectionsApiUrl = buildDirectionsApiUrl;

  function fetchRouteFromDirectionsApi(params) {
    if (!TOKEN || !params || !params.coordinates) return;
    selfFetchStarted = true;
    var url = buildDirectionsApiUrl(params, TOKEN, API_ENDPOINT);
    fetch(url)
      .then(function(res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function() { return null; })
            .then(function(body) {
              var msg =
                body && body.message
                  ? body.message
                  : 'Directions API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        if (routeRendered) return;
        var route = data && data.routes && data.routes[0];
        var picked = route ? pickRouteGeometry(route) : null;
        if (picked) {
          renderRoute(picked);
        } else {
          showError('Directions API returned no route.');
        }
      })
      .catch(function(err) {
        if (routeRendered) return;
        showError(
          'Could not fetch route: ' + (err && err.message ? err.message : err)
        );
      });
  }

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
    if (message.method === 'ui/notifications/tool-input' && message.params) {
      fetchRouteFromDirectionsApi(message.params.arguments);
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
  // Initial data path (MCP-UI rawHtml): the tool call's input params were
  // baked in server-side. Self-fetch the route from the Directions API
  // rather than relying on baked-in geometry from the tool response.
  // -------------------------------------------------------------------------
  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (!data || !data.params) return;
      fetchRouteFromDirectionsApi(data.params);
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    if (routeRendered) return;
    var route = extractRoute(result);
    if (route) {
      renderRoute(route);
      return;
    }

    // Fallback: large directions responses are stored as a temporary resource
    // (mapbox://temp/directions-id) and the structuredContent is stripped of
    // geometry to keep the agent context light. Read it back via the
    // MCP Apps host resources/read bridge.
    var tempUri = findTempResourceUri(result);
    if (tempUri) {
      loadingEl.textContent = 'Fetching full route…';
      sendRequest('resources/read', { uri: tempUri }).then(
        function(rr) {
          if (routeRendered) return;
          var fetched = readResourceJson(rr);
          var fetchedRoute = fetched ? extractRoute({ structuredContent: fetched }) : null;
          if (fetchedRoute) {
            renderRoute(fetchedRoute);
          } else {
            showError('Could not parse route from the temporary resource.');
          }
        },
        function(err) {
          if (routeRendered) return;
          showError('Could not read temporary resource: ' + (err && err.message ? err.message : err));
        }
      );
      return;
    }

    // Self-fetch (kicked off by the earlier tool-input notification) is
    // either still in flight or already reported its own error via its
    // .catch() handler — either way, this isn't the right error to show.
    if (selfFetchStarted) return;

    showError('Could not find route data in tool result.');
  }

  function renderRoute(route) {
    routeRendered = true;
    if (route.summary) {
      summaryEl.textContent = route.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawRoute(route);
    else pendingRoute = route;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  // Mapbox MCP server emits the URI in the summary text content of large
  // responses: "Resource URI: mapbox://temp/directions-<hex>".
  function findTempResourceUri(result) {
    if (!result || !Array.isArray(result.content)) return null;
    for (var i = 0; i < result.content.length; i++) {
      var c = result.content[i];
      if (c && c.type === 'text' && typeof c.text === 'string') {
        var m = c.text.match(/mapbox:\\/\\/temp\\/directions-[0-9a-fA-F]+/);
        if (m) return m[0];
      }
    }
    return null;
  }

  // resources/read responses have shape: { contents: [{ text: "<json>", ... }] }
  function readResourceJson(rr) {
    if (!rr || !Array.isArray(rr.contents) || rr.contents.length === 0) return null;
    var first = rr.contents[0];
    if (!first || typeof first.text !== 'string') return null;
    try { return JSON.parse(first.text); } catch (_) { return null; }
  }

  function extractRoute(result) {
    var sc = result && result.structuredContent;
    if (sc && Array.isArray(sc.routes) && sc.routes.length > 0) {
      var picked = pickRouteGeometry(sc.routes[0]);
      if (picked) return picked;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && Array.isArray(parsed.routes) && parsed.routes[0]) {
              var picked2 = pickRouteGeometry(parsed.routes[0]);
              if (picked2) return picked2;
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

  // Mapbox Directions can return geometry in 3 shapes:
  //   - GeoJSON  : { type: 'LineString', coordinates: [[lng,lat], ...] }
  //   - polyline : "encoded_string"  (precision 5, default)
  //   - polyline6: "encoded_string"  (precision 6)
  // We accept all three and normalize to GeoJSON for rendering.
  function pickRouteGeometry(route) {
    if (!route || !route.geometry) return null;
    var g = route.geometry;
    if (typeof g === 'object' && Array.isArray(g.coordinates) && g.coordinates.length) {
      return { geometry: g, summary: buildSummary(route) };
    }
    if (typeof g === 'string' && g.length > 0) {
      // Pick precision: polyline6 strings often contain '_' / '@'-like density
      // but the response usually carries a hint at top level. Try 6 first if
      // the response object says so, else 5.
      var coords = decodePolyline(g, 5);
      if (coords.length > 0 && coordsLookSane(coords)) {
        return {
          geometry: { type: 'LineString', coordinates: coords },
          summary: buildSummary(route)
        };
      }
      coords = decodePolyline(g, 6);
      if (coords.length > 0 && coordsLookSane(coords)) {
        return {
          geometry: { type: 'LineString', coordinates: coords },
          summary: buildSummary(route)
        };
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

  // Standard Google/Mapbox polyline decoder. Precision = 5 (default) or 6.
  function decodePolyline(str, precision) {
    precision = precision || 5;
    var factor = Math.pow(10, precision);
    var coords = [];
    var lat = 0;
    var lng = 0;
    var i = 0;
    while (i < str.length) {
      var shift = 0;
      var result = 0;
      var b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0;
      result = 0;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lng / factor, lat / factor]);
    }
    return coords;
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

    errorEl.style.display = 'none';

    if (route.summary && summaryEl.style.display === 'none') {
      summaryEl.textContent = route.summary;
      summaryEl.style.display = 'block';
    }

    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getSource('route')) map.removeSource('route');
    // Remove any markers from a prior render so we don't stack pins.
    for (var mi = 0; mi < routeMarkers.length; mi++) {
      routeMarkers[mi].remove();
    }
    routeMarkers = [];

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
    routeMarkers.push(
      new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat(coords[0])
        .setPopup(new mapboxgl.Popup().setText('Start'))
        .addTo(map)
    );
    routeMarkers.push(
      new mapboxgl.Marker({ color: '#ef4444' })
        .setLngLat(coords[coords.length - 1])
        .setPopup(new mapboxgl.Popup().setText('End'))
        .addTo(map)
    );

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
