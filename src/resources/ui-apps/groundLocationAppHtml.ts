// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the ground-location MCP App HTML — used by both the MCP Apps resource
 * and the inline MCP-UI rawHtml block emitted by `ground_location_tool`.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface GroundLocationAppInitialData {
  origin: {
    longitude: number;
    latitude: number;
    name: string;
    address?: string;
  };
  pois?: Array<{
    index: number;
    name: string;
    address?: string;
    category?: string;
    location: [number, number];
  }>;
  summary?: string;
}

export function renderGroundLocationAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: GroundLocationAppInitialData;
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
<title>Ground Location</title>
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
  #loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #666; font-size: 16px; z-index: 10; pointer-events: none;
  }
  #error {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #d32f2f; background: #ffebee; border-radius: 8px;
    padding: 20px; max-width: 400px; text-align: center; z-index: 10;
  }
  .origin-marker {
    width: 32px; height: 32px; border-radius: 50%;
    background: #0f172a; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .poi-marker {
    width: 26px; height: 26px; border-radius: 50%;
    background: #f97316; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: pointer;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="loading">Loading location…</div>
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
  var poiMarkers = [];

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
    appInfo: { name: 'Ground Location', version: '1.0.0' }
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
      if (pendingPayload) { drawScene(pendingPayload); pendingPayload = null; }
      else { consumeInitialData(); }
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && data.origin) drawScene(data);
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload) { renderPayload(payload); return; }
    showError('No location data in tool result.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawScene(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function extractPayload(result) {
    var sc = result && result.structuredContent;
    // ground_location_tool returns GroundLocationOutput shape:
    // { place, full_address?, longitude, latitude, nearby_pois?: [{name, address?, longitude, latitude, category?}], isochrone?, citations }
    if (sc && typeof sc.place === 'string' && typeof sc.longitude === 'number' && typeof sc.latitude === 'number') {
      var poiList = Array.isArray(sc.nearby_pois) ? sc.nearby_pois : [];
      var pois = poiList
        .filter(function(p) { return p && typeof p.longitude === 'number' && typeof p.latitude === 'number'; })
        .map(function(p, idx) {
          return {
            index: idx + 1,
            name: p.name || 'Place',
            address: p.address,
            category: p.category,
            location: [p.longitude, p.latitude]
          };
        });
      return {
        origin: {
          longitude: sc.longitude,
          latitude: sc.latitude,
          name: sc.place,
          address: sc.full_address
        },
        pois: pois,
        summary: pois.length > 0 ? sc.place + ' — ' + pois.length + ' nearby' : sc.place
      };
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function drawScene(payload) {
    var origin = payload.origin;
    var pois = Array.isArray(payload.pois) ? payload.pois : [];

    if (originMarker) { originMarker.remove(); originMarker = null; }
    for (var pi = 0; pi < poiMarkers.length; pi++) poiMarkers[pi].remove();
    poiMarkers = [];

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0]; if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0]; if (c[1] > maxLat) maxLat = c[1];
    }

    extend([origin.longitude, origin.latitude]);
    var originEl = document.createElement('div');
    originEl.className = 'origin-marker';
    originEl.textContent = '•';
    var originPopup =
      '<strong>' + escapeHtml(origin.name) + '</strong>' +
      (origin.address ? '<br>' + escapeHtml(origin.address) : '');
    originMarker = new mapboxgl.Marker({ element: originEl })
      .setLngLat([origin.longitude, origin.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(originPopup))
      .addTo(map);

    pois.forEach(function(p) {
      extend(p.location);
      var el = document.createElement('div');
      el.className = 'poi-marker';
      el.textContent = String(p.index);
      var popupHtml = '<strong>' + escapeHtml(p.name) + '</strong>';
      if (p.category) popupHtml += '<br><em>' + escapeHtml(p.category) + '</em>';
      if (p.address) popupHtml += '<br>' + escapeHtml(p.address);
      poiMarkers.push(
        new mapboxgl.Marker({ element: el })
          .setLngLat(p.location)
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml))
          .addTo(map)
      );
    });

    loadingEl.style.display = 'none';
    requestSizeToFit();

    if (isFinite(minLng)) {
      setTimeout(function() {
        map.resize();
        if (minLng === maxLng && minLat === maxLat) {
          map.flyTo({ center: [minLng, minLat], zoom: 14 });
        } else {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
            padding: { top: 70, bottom: 30, left: 30, right: 30 },
            duration: 600,
            maxZoom: 15
          });
        }
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

import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import type { HttpRequest } from '../../utils/types.js';

interface PoiLike {
  name?: string;
  address?: string;
  category?: string;
  longitude?: number;
  latitude?: number;
}

export async function tryRenderGroundLocationInlineHtml(params: {
  place: string;
  full_address?: string;
  longitude: number;
  latitude: number;
  nearby_pois?: PoiLike[];
  accessToken: string;
  apiEndpoint: string;
  httpRequest: HttpRequest;
}): Promise<string | undefined> {
  const {
    place,
    full_address,
    longitude,
    latitude,
    nearby_pois,
    accessToken,
    apiEndpoint,
    httpRequest
  } = params;

  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  const pois = (nearby_pois ?? [])
    .filter(
      (p): p is PoiLike & { longitude: number; latitude: number } =>
        typeof p?.longitude === 'number' && typeof p?.latitude === 'number'
    )
    .map((p, idx) => ({
      index: idx + 1,
      name: p.name ?? 'Place',
      address: p.address,
      category: p.category,
      location: [p.longitude, p.latitude] as [number, number]
    }));

  return renderGroundLocationAppHtml({
    publicToken,
    initialData: {
      origin: { longitude, latitude, name: place, address: full_address },
      pois,
      summary: pois.length > 0 ? `${place} — ${pois.length} nearby` : place
    }
  });
}
