// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the isochrone MCP App HTML — used by both the MCP Apps resource
 * (postMessage delivery) and `isochrone_tool`'s inline MCP-UI rawHtml block
 * (initial-data baked in). See the directions counterpart for the rationale.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface IsochroneAppInitialData {
  featureCollection: { type: string; features: unknown[] };
  origin?: { longitude: number; latitude: number };
  summary?: string;
}

export function renderIsochroneAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: IsochroneAppInitialData;
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
<title>Isochrone Preview</title>
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
<div id="loading">Loading isochrone…</div>
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
  var originMarker = null;
  var contourLayerIds = [];
  var contourSourceIds = [];

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
    appInfo: { name: 'Isochrone Preview', version: '1.0.0' }
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
        drawIsochrone(pendingPayload);
        pendingPayload = null;
      } else {
        consumeInitialData();
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.featureCollection) {
        drawIsochrone(data);
      }
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload) {
      renderPayload(payload);
      return;
    }
    var tempUri = findTempResourceUri(result);
    if (tempUri) {
      loadingEl.textContent = 'Fetching full isochrone…';
      sendRequest('resources/read', { uri: tempUri }).then(
        function(rr) {
          var fetched = readResourceJson(rr);
          if (fetched && fetched.features) {
            renderPayload({ featureCollection: fetched });
          } else {
            showError('Could not parse isochrone from the temporary resource.');
          }
        },
        function(err) {
          showError('Could not read temporary resource: ' + (err && err.message ? err.message : err));
        }
      );
      return;
    }
    showError('Could not find isochrone data in tool result.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawIsochrone(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function extractPayload(result) {
    var sc = result && result.structuredContent;
    // isochrone_tool returns the API response directly:
    // { type: 'FeatureCollection', features: [...] }
    if (sc && sc.type === 'FeatureCollection' && Array.isArray(sc.features) && sc.features.length > 0) {
      return { featureCollection: sc };
    }
    // Legacy app-tool payload shape (no longer emitted but handled for compatibility)
    if (sc && sc.isochrone && sc.isochrone.featureCollection) {
      return sc.isochrone;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
              return { featureCollection: parsed };
            }
            if (parsed && parsed.featureCollection) return parsed;
            if (parsed && parsed.isochrone && parsed.isochrone.featureCollection) {
              return parsed.isochrone;
            }
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  function findTempResourceUri(result) {
    if (!result || !Array.isArray(result.content)) return null;
    for (var i = 0; i < result.content.length; i++) {
      var c = result.content[i];
      if (c && c.type === 'text' && typeof c.text === 'string') {
        var m = c.text.match(/mapbox:\\/\\/temp\\/isochrone-[0-9a-fA-F]+/);
        if (m) return m[0];
      }
    }
    return null;
  }

  function readResourceJson(rr) {
    if (!rr || !Array.isArray(rr.contents) || rr.contents.length === 0) return null;
    var first = rr.contents[0];
    if (!first || typeof first.text !== 'string') return null;
    try { return JSON.parse(first.text); } catch (_) { return null; }
  }

  function drawIsochrone(payload) {
    var fc = payload.featureCollection;
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
      showError('Isochrone has no contours.');
      return;
    }
    // Mapbox returns contours largest-first; reverse so smaller ones render on top.
    var features = fc.features.slice().reverse();

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }
    function walkCoords(coords) {
      if (typeof coords[0] === 'number') extend(coords);
      else for (var i = 0; i < coords.length; i++) walkCoords(coords[i]);
    }

    // Tear down any prior layers/sources/markers
    for (var li = 0; li < contourLayerIds.length; li++) {
      if (map.getLayer(contourLayerIds[li])) map.removeLayer(contourLayerIds[li]);
    }
    for (var si = 0; si < contourSourceIds.length; si++) {
      if (map.getSource(contourSourceIds[si])) map.removeSource(contourSourceIds[si]);
    }
    contourLayerIds = [];
    contourSourceIds = [];
    if (originMarker) { originMarker.remove(); originMarker = null; }

    features.forEach(function(feature, i) {
      var props = feature.properties || {};
      var color = '#' + (props.color || props.fillColor || '3b82f6').replace(/^#/, '');
      var fillOpacity = typeof props.fillOpacity === 'number' ? props.fillOpacity : 0.25;

      var sid = 'iso-source-' + i;
      var fid = 'iso-fill-' + i;
      var lid = 'iso-line-' + i;
      map.addSource(sid, { type: 'geojson', data: feature });
      map.addLayer({
        id: fid, type: 'fill', source: sid,
        paint: { 'fill-color': color, 'fill-opacity': fillOpacity }
      });
      map.addLayer({
        id: lid, type: 'line', source: sid,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 }
      });
      contourSourceIds.push(sid);
      contourLayerIds.push(fid, lid);
      if (feature.geometry) walkCoords(feature.geometry.coordinates);
    });

    if (payload.origin && typeof payload.origin.longitude === 'number') {
      originMarker = new mapboxgl.Marker({ color: '#0f172a' })
        .setLngLat([payload.origin.longitude, payload.origin.latitude])
        .setPopup(new mapboxgl.Popup().setText('Origin'))
        .addTo(map);
    }

    loadingEl.style.display = 'none';
    requestSizeToFit();

    if (isFinite(minLng)) {
      setTimeout(function() {
        map.resize();
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: { top: 70, bottom: 30, left: 30, right: 30 },
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
