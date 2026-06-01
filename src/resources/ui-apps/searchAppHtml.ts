// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Render the search-results MCP App HTML — used by both the MCP Apps resource
 * and the inline MCP-UI rawHtml block emitted by `search_and_geocode_tool`
 * and `category_search_tool`.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export interface SearchAppInitialData {
  results: Array<{
    index: number;
    name: string;
    address?: string;
    category?: string;
    location: [number, number];
  }>;
  proximity?: { longitude: number; latitude: number };
  summary?: string;
}

export function renderSearchAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: SearchAppInitialData;
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
<title>Search Results</title>
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
  .result-marker {
    width: 28px; height: 28px; border-radius: 50%;
    background: #f97316; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: pointer;
  }
  .proximity-marker {
    width: 14px; height: 14px; border-radius: 50%;
    background: #0f172a; border: 3px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="loading">Loading results…</div>
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
  var resultMarkers = [];
  var proximityMarker = null;

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
    appInfo: { name: 'Search Results', version: '1.0.0' }
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
      if (pendingPayload) { drawResults(pendingPayload); pendingPayload = null; }
      else { consumeInitialData(); }
    });
  }
  initMap();

  function consumeInitialData() {
    var el = document.getElementById('initial-data');
    if (!el || !el.textContent) return;
    try {
      var data = JSON.parse(el.textContent);
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        drawResults(data);
      }
    } catch (_) { /* ignore */ }
  }

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (payload && payload.results.length > 0) {
      renderPayload(payload);
      return;
    }
    showError('No search results to display.');
  }

  function renderPayload(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) drawResults(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  function extractPayload(result) {
    var sc = result && result.structuredContent;
    // search_and_geocode_tool / category_search_tool return a Mapbox
    // FeatureCollection: { type: 'FeatureCollection', features: [...] }
    if (sc && sc.type === 'FeatureCollection' && Array.isArray(sc.features)) {
      return { results: shapeResults(sc.features) };
    }
    if (sc && Array.isArray(sc.results)) return sc;
    if (sc && sc.search && Array.isArray(sc.search.results)) return sc.search;
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
              return { results: shapeResults(parsed.features) };
            }
            if (parsed && Array.isArray(parsed.results)) return parsed;
            if (parsed && parsed.search && Array.isArray(parsed.search.results)) return parsed.search;
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  function shapeResults(features) {
    var out = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length !== 2) continue;
      var props = f.properties || {};
      out.push({
        index: out.length + 1,
        name: props.name || 'Result',
        address: props.full_address || props.place_formatted || undefined,
        category: (props.poi_category && props.poi_category[0]) || undefined,
        location: f.geometry.coordinates
      });
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function drawResults(payload) {
    var results = payload.results;

    for (var ri = 0; ri < resultMarkers.length; ri++) resultMarkers[ri].remove();
    resultMarkers = [];
    if (proximityMarker) { proximityMarker.remove(); proximityMarker = null; }

    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }

    results.forEach(function(r) {
      extend(r.location);
      var el = document.createElement('div');
      el.className = 'result-marker';
      el.textContent = String(r.index);

      var popupHtml = '<strong>' + escapeHtml(r.name) + '</strong>';
      if (r.category) popupHtml += '<br><em>' + escapeHtml(r.category) + '</em>';
      if (r.address) popupHtml += '<br>' + escapeHtml(r.address);
      var lng = r.location[0].toFixed(4);
      var lat = r.location[1].toFixed(4);
      popupHtml += '<br><small>' + lat + ', ' + lng + '</small>';

      resultMarkers.push(
        new mapboxgl.Marker({ element: el })
          .setLngLat(r.location)
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml))
          .addTo(map)
      );
    });

    if (payload.proximity && typeof payload.proximity.longitude === 'number') {
      extend([payload.proximity.longitude, payload.proximity.latitude]);
      var origin = document.createElement('div');
      origin.className = 'proximity-marker';
      proximityMarker = new mapboxgl.Marker({ element: origin })
        .setLngLat([payload.proximity.longitude, payload.proximity.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 8 }).setText('Proximity (you)'))
        .addTo(map);
    }

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

/**
 * Bake a Mapbox FeatureCollection of search results into the shared iframe
 * template for MCP-UI clients. Returns undefined when there are no usable
 * results or no public token can be resolved.
 */
export async function tryRenderSearchInlineHtml(params: {
  featureCollection: { features?: unknown[] };
  proximity?: { longitude: number; latitude: number };
  summary?: string;
  accessToken: string;
  apiEndpoint: string;
  httpRequest: HttpRequest;
}): Promise<string | undefined> {
  const {
    featureCollection,
    proximity,
    summary,
    accessToken,
    apiEndpoint,
    httpRequest
  } = params;

  const results = shapeSearchFeatures(featureCollection.features ?? []);
  if (results.length === 0) return undefined;

  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  return renderSearchAppHtml({
    publicToken,
    initialData: { results, proximity, summary }
  });
}

interface FeatureLike {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
  };
}

function shapeSearchFeatures(
  features: unknown[]
): SearchAppInitialData['results'] {
  const out: SearchAppInitialData['results'] = [];
  for (const raw of features) {
    const f = raw as FeatureLike;
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) continue;
    out.push({
      index: out.length + 1,
      name: f.properties?.name ?? 'Result',
      address: f.properties?.full_address ?? f.properties?.place_formatted,
      category: f.properties?.poi_category?.[0],
      location: coords
    });
  }
  return out;
}
