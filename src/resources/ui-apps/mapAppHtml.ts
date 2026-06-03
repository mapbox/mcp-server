// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from '../../utils/mapAppPayload.js';

/**
 * Render the generic Mapbox MCP App HTML — used by both the MCP Apps
 * resource (postMessage delivery) and any tool's inline MCP-UI rawHtml
 * block (initial-data baked in).
 *
 * The iframe is a thin renderer over Mapbox GL JS. Tools produce a
 * `MapAppPayload` (see src/utils/mapAppPayload.ts) and the iframe
 * translates each layer/marker/legend entry into the corresponding
 * GL JS call. No tool-specific code lives in this file.
 */

export const MAPBOX_GL_VERSION = '3.12.0';

export function renderMapAppHtml(params: {
  publicToken: string;
  glVersion?: string;
  initialData?: MapAppPayload;
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
<title>Map</title>
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
    max-width: calc(100% - 24px); white-space: pre-line;
  }
  #legend {
    position: absolute; bottom: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.88); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 11px;
  }
  #legend .row { display: flex; align-items: center; margin: 2px 0; }
  #legend .swatch {
    display: inline-block; width: 14px; height: 14px;
    margin-right: 6px; border-radius: 3px;
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
  .marker-badge {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 13px; font-weight: 700;
    border: 2px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: pointer;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="legend" style="display:none"></div>
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

  var map = null;
  var mapLoaded = false;
  var pendingPayload = null;
  var currentDisplayMode = 'inline';

  // Tracks what we've added so re-renders can tear down cleanly.
  var trackedLayerIds = [];
  var trackedSourceIds = [];
  var trackedMarkers = [];

  // --- MCP App postMessage protocol -----------------------------------------
  var messageId = 0;
  var pendingRequests = new Map();

  function sendRequest(method, params) {
    var id = ++messageId;
    try {
      window.parent.postMessage({
        jsonrpc: '2.0', id: id, method: method, params: params || {}
      }, '*');
    } catch (_) {}
    return new Promise(function(resolve, reject) {
      pendingRequests.set(id, { resolve: resolve, reject: reject });
    });
  }
  function sendNotification(method, params) {
    try {
      window.parent.postMessage({
        jsonrpc: '2.0', method: method, params: params || {}
      }, '*');
    } catch (_) {}
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
    if (message.method === 'ui/notifications/host-context-changed' &&
        message.params && message.params.displayMode) {
      currentDisplayMode = message.params.displayMode;
      if (map) setTimeout(function() { map.resize(); }, 100);
    }
  });

  sendRequest('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox Map', version: '1.0.0' }
  }).then(
    function() { sendNotification('ui/notifications/initialized', {}); },
    function() { sendNotification('ui/notifications/initialized', {}); }
  );

  // --- Map setup ------------------------------------------------------------
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
        render(pendingPayload);
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
      if (data && Array.isArray(data.layers)) render(data);
    } catch (_) { /* ignore */ }
  }

  // --- Tool result extraction ----------------------------------------------
  function handleToolResult(result) {
    var ref = extractPayloadRef(result);
    if (ref) {
      sendRequest('resources/read', { uri: ref }).then(
        function(rr) {
          var fetched = readResourceJson(rr);
          if (fetched && looksLikePayload(fetched)) stageRender(fetched);
          else showError('Map payload was empty or malformed.');
        },
        function(err) {
          showError('Could not read map payload: ' +
            (err && err.message ? err.message : err));
        }
      );
      return;
    }
    var payload = extractInlinePayload(result);
    if (payload) {
      stageRender(payload);
      return;
    }
    showError('Tool result did not contain a map payload.');
  }

  // Claude Desktop strips structuredContent from tool-result postMessages
  // before forwarding to MCP App iframes — only content and isError
  // survive. So the ref has to ride inside a content[] text item, prefixed
  // with a sentinel the iframe recognizes.
  var REF_SENTINEL = '[[MAPBOX_RENDER_REF]]';
  var REF_URI_RE = new RegExp('mapbox://temp/map-payload-[0-9a-fA-F-]+');

  function extractPayloadRef(result) {
    if (!result) return null;
    // structuredContent path: spec-compliant, kept as fallback for hosts
    // that DO forward structuredContent.
    var sc = result.structuredContent;
    if (sc && sc.mapboxRender && typeof sc.mapboxRender.ref === 'string') {
      return sc.mapboxRender.ref;
    }
    // content[] path: scan text items for the sentinel + ref URI.
    if (result.content && result.content.length) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string' &&
            c.text.indexOf(REF_SENTINEL) !== -1) {
          var m = c.text.match(REF_URI_RE);
          if (m) return m[0];
        }
      }
    }
    return null;
  }

  function extractInlinePayload(result) {
    if (!result) return null;
    var sc = result.structuredContent;
    if (sc && sc.mapboxRender && looksLikePayload(sc.mapboxRender)) {
      return sc.mapboxRender;
    }
    if (result._meta && result._meta.ui && looksLikePayload(result._meta.ui.payload)) {
      return result._meta.ui.payload;
    }
    return null;
  }

  function looksLikePayload(p) {
    return p && typeof p === 'object' &&
      (Array.isArray(p.layers) || Array.isArray(p.markers));
  }

  function stageRender(payload) {
    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    } else {
      summaryEl.style.display = 'none';
    }
    if (!map) { loadingEl.style.display = 'none'; return; }
    if (mapLoaded) render(payload);
    else pendingPayload = payload;
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  // --- Renderer -------------------------------------------------------------
  function teardown() {
    trackedLayerIds.forEach(function(id) {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    trackedSourceIds.forEach(function(id) {
      if (map.getSource(id)) map.removeSource(id);
    });
    trackedMarkers.forEach(function(m) { m.remove(); });
    trackedLayerIds = [];
    trackedSourceIds = [];
    trackedMarkers = [];
  }

  function bboxAccumulator() {
    var minLng = Infinity, minLat = Infinity;
    var maxLng = -Infinity, maxLat = -Infinity;
    return {
      extend: function(coords) {
        if (typeof coords[0] === 'number') {
          if (coords[0] < minLng) minLng = coords[0];
          if (coords[1] < minLat) minLat = coords[1];
          if (coords[0] > maxLng) maxLng = coords[0];
          if (coords[1] > maxLat) maxLat = coords[1];
        } else {
          for (var i = 0; i < coords.length; i++) this.extend(coords[i]);
        }
      },
      bounds: function() {
        if (!isFinite(minLng)) return null;
        return [[minLng, minLat], [maxLng, maxLat]];
      }
    };
  }

  var STYLE_DEFAULTS = {
    pin: { color: '#3b82f6' },
    numbered: { color: '#2563eb' },
    start: { color: '#22c55e' },
    end: { color: '#ef4444' }
  };

  function buildBadgeElement(label, color) {
    var el = document.createElement('div');
    el.className = 'marker-badge';
    el.style.background = color;
    el.textContent = label;
    return el;
  }

  function render(payload) {
    if (!map) return;
    teardown();

    var bbox = bboxAccumulator();
    var layers = Array.isArray(payload.layers) ? payload.layers : [];
    var markers = Array.isArray(payload.markers) ? payload.markers : [];

    layers.forEach(function(layer) {
      if (!layer || !layer.id || !layer.data) return;
      map.addSource(layer.id, { type: 'geojson', data: layer.data });
      trackedSourceIds.push(layer.id);

      var def = {
        id: layer.id,
        type: layer.type,
        source: layer.id
      };
      if (layer.paint) def.paint = layer.paint;
      if (layer.layout) def.layout = layer.layout;
      map.addLayer(def);
      trackedLayerIds.push(layer.id);

      var feature = layer.data;
      if (feature.type === 'FeatureCollection' && Array.isArray(feature.features)) {
        feature.features.forEach(function(f) {
          if (f && f.geometry) bbox.extend(f.geometry.coordinates);
        });
      } else if (feature.geometry) {
        bbox.extend(feature.geometry.coordinates);
      }
    });

    markers.forEach(function(m) {
      if (!m || !Array.isArray(m.coordinates) || m.coordinates.length < 2 ||
          typeof m.coordinates[0] !== 'number' ||
          typeof m.coordinates[1] !== 'number') return;
      var style = m.style || 'pin';
      var color = m.color ||
        (STYLE_DEFAULTS[style] && STYLE_DEFAULTS[style].color) || '#3b82f6';
      var marker;
      if (style === 'numbered' || style === 'start' || style === 'end') {
        var label = m.label || (style === 'start' ? 'S' : style === 'end' ? 'E' : '');
        marker = new mapboxgl.Marker({ element: buildBadgeElement(label, color) });
      } else {
        marker = new mapboxgl.Marker({ color: color });
      }
      marker.setLngLat(m.coordinates);
      if (m.popup) marker.setPopup(new mapboxgl.Popup().setText(m.popup));
      marker.addTo(map);
      trackedMarkers.push(marker);
      bbox.extend(m.coordinates);
    });

    // Legend
    if (Array.isArray(payload.legend) && payload.legend.length > 0) {
      legendEl.innerHTML = payload.legend.map(function(row) {
        var op = (typeof row.opacity === 'number') ? row.opacity : 1;
        return '<div class="row"><span class="swatch" style="background:' +
          escapeAttr(row.color) + ';opacity:' + op + '"></span>' +
          escapeText(row.label) + '</div>';
      }).join('');
      legendEl.style.display = 'block';
    } else {
      legendEl.style.display = 'none';
    }

    loadingEl.style.display = 'none';
    requestSizeToFit();

    // Camera: explicit camera takes precedence; otherwise auto-fit.
    var camera = payload.camera || {};
    if (camera.bounds) {
      setTimeout(function() {
        map.resize();
        map.fitBounds(camera.bounds, {
          padding: { top: 70, bottom: 50, left: 30, right: 30 },
          duration: 600
        });
      }, 60);
    } else if (camera.center) {
      setTimeout(function() {
        map.resize();
        map.flyTo({
          center: camera.center,
          zoom: (typeof camera.zoom === 'number') ? camera.zoom : 12,
          duration: 600
        });
      }, 60);
    } else {
      var bounds = bbox.bounds();
      if (bounds) {
        setTimeout(function() {
          map.resize();
          map.fitBounds(bounds, {
            padding: { top: 70, bottom: 50, left: 30, right: 30 },
            duration: 600
          });
        }, 60);
      }
    }

    // Deferred large-geometry fetch.
    if (payload.defer && typeof payload.defer.resourceUri === 'string' &&
        typeof payload.defer.layerId === 'string') {
      sendRequest('resources/read', { uri: payload.defer.resourceUri }).then(
        function(rr) {
          var data = readResourceJson(rr);
          if (!data) return;
          var src = map.getSource(payload.defer.layerId);
          if (src && typeof src.setData === 'function') src.setData(data);
        },
        function() { /* ignore — keep what we rendered inline */ }
      );
    }
  }

  function readResourceJson(rr) {
    if (!rr || !Array.isArray(rr.contents) || rr.contents.length === 0) return null;
    var first = rr.contents[0];
    if (!first || typeof first.text !== 'string') return null;
    try { return JSON.parse(first.text); } catch (_) { return null; }
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeText(s).replace(/"/g, '&quot;');
  }
})();
</script>
</body>
</html>`;
}

function escapeForScript(s: string): string {
  return s.replace(/<\/script>/gi, '<\\/script>');
}
