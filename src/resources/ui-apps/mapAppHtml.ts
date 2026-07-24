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

// Verified against the current latest stable release (3.26.0, as of this
// writing) in a real browser: Map/NavigationControl/addSource/addLayer/
// Marker/Popup/fitBounds/flyTo all work with zero console errors, so there's
// no reason to stay pinned to an old version.
export const MAPBOX_GL_VERSION = '3.26.0';

export function renderMapAppHtml(params: {
  publicToken: string;
  apiEndpoint?: string;
  glVersion?: string;
  initialData?: MapAppPayload;
}): string {
  const { publicToken, initialData } = params;
  const apiEndpoint = params.apiEndpoint ?? 'https://api.mapbox.com/';
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
  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};

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
  // Inline payload is checked FIRST, before the ref: some hosts (e.g.
  // ChatGPT's MCP Apps bridge) deliver structuredContent to the iframe
  // intact but have no resources/read equivalent at all, so a ref there
  // would be permanently unusable even though the actual payload data is
  // sitting right there in the same tool result. Hosts that strip
  // structuredContent (e.g. Claude Desktop) never have inline data to find
  // here, so they fall through to the ref path exactly as before.
  function handleToolResult(result) {
    var payload = extractInlinePayload(result);
    if (payload) {
      stageRender(payload);
      return;
    }
    var ref = extractPayloadRef(result);
    if (ref) {
      sendRequest('resources/read', { uri: ref }).then(
        function(rr) {
          // The server marks an expired/unknown ref with mimeType
          // text/plain and a human-readable explanation (see
          // TemporaryDataResource) instead of the usual application/json
          // payload. Surface that explanation directly — e.g. after the
          // conversation is rehydrated the ref may be minutes/hours stale
          // — rather than a generic "malformed" message that gives no clue
          // what happened or what to do about it.
          var expired = readResourceExpiryMessage(rr);
          if (expired) {
            showError(expired + ' Ask again to regenerate the map.');
            return;
          }
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
    showError('Tool result did not contain a map payload.');
  }

  function readResourceExpiryMessage(rr) {
    if (!rr || !Array.isArray(rr.contents) || rr.contents.length === 0) return null;
    var first = rr.contents[0];
    if (first && first.mimeType === 'text/plain' && typeof first.text === 'string') {
      return first.text;
    }
    return null;
  }

  // Claude Desktop strips structuredContent from tool-result postMessages
  // before forwarding to MCP App iframes — only content and isError
  // survive. So the ref has to ride inside a content[] text item, prefixed
  // with a sentinel the iframe recognizes.
  var REF_SENTINEL = '[[MAPBOX_RENDER_REF]]';
  // Matches either render_map_tool output ref scheme: the legacy
  // server-stored kind, or the self-describing mapbox://inline/ kind (see
  // inlinePayloadRef.ts) it now prefers whenever the payload is small
  // enough to carry inline — a [?] character class matches the literal
  // query-string separator without needing an escaped-question-mark
  // sequence, which this JS-in-a-TS-template-literal file would otherwise
  // have to double-escape.
  var REF_URI_RE = new RegExp(
    'mapbox://(?:temp/map-payload-[0-9a-fA-F-]+|inline/payload[?]data=[A-Za-z0-9_-]+)'
  );

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

  // Shared by render() (full rebuild) and mergeAdditionalPayload() (adds
  // on top of what's already drawn, for self-fetched layers that resolve
  // after the initial render).
  function addOneLayer(layer, bbox) {
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
  }

  function addOneMarker(m, bbox) {
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
  }

  function fitToBounds(bounds) {
    setTimeout(function() {
      map.resize();
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 50, left: 30, right: 30 },
        duration: 600
      });
    }, 60);
  }

  // Adds a follow-up payload's layers/markers on top of what's already on
  // the map (does NOT teardown first) and refits to include the new
  // content. Used once a self-fetched layer (e.g. a directions route)
  // resolves after the initial render.
  function mergeAdditionalPayload(payload) {
    if (!map) return;
    var bbox = bboxAccumulator();
    (Array.isArray(payload.layers) ? payload.layers : []).forEach(function(layer) {
      addOneLayer(layer, bbox);
    });
    (Array.isArray(payload.markers) ? payload.markers : []).forEach(function(m) {
      addOneMarker(m, bbox);
    });
    if (payload.summary && summaryEl.style.display === 'none') {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }
    var bounds = bbox.bounds();
    if (bounds) fitToBounds(bounds);
  }

  function render(payload) {
    if (!map) return;
    teardown();

    var bbox = bboxAccumulator();
    var layers = Array.isArray(payload.layers) ? payload.layers : [];
    var markers = Array.isArray(payload.markers) ? payload.markers : [];

    layers.forEach(function(layer) { addOneLayer(layer, bbox); });
    markers.forEach(function(m) { addOneMarker(m, bbox); });

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
      fitToBounds(camera.bounds);
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
      if (bounds) fitToBounds(bounds);
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

    // Self-fetched layers (e.g. a directions route): the ref only carried
    // the tool's own input params, so fetch and draw them ourselves now
    // that the map is up, rather than depend on server-computed geometry.
    if (Array.isArray(payload.selfFetch)) {
      payload.selfFetch.forEach(function(sf) {
        if (sf && sf.tool === 'directions') selfFetchDirections(sf.params);
      });
    }
  }

  function readResourceJson(rr) {
    if (!rr || !Array.isArray(rr.contents) || rr.contents.length === 0) return null;
    var first = rr.contents[0];
    if (!first || typeof first.text !== 'string') return null;
    try { return JSON.parse(first.text); } catch (_) { return null; }
  }

  // --- Self-fetch: directions ------------------------------------------------
  // Builds a Directions API request directly from directions_tool's own
  // input params and fetches the route ourselves, using the same public
  // token GL JS already uses for tiles — so this layer never depends on
  // server-side storage that a restart or a rehydrated conversation could
  // invalidate (see src/utils/selfFetchRef.ts).
  //
  // Mirrors src/tools/directions-tool/buildDirectionsRequestUrl.ts — kept
  // in sync by the parity test in
  // test/resources/ui-apps/directionsSelfFetchUrlParity.test.ts. Always
  // forces geometries=geojson regardless of what directions_tool's own
  // call requested.
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

  // params came from the ref (attacker-controlled if a sibling frame could
  // forge postMessages) and get interpolated into the request URL, so
  // validate the pieces our encoding does not neutralize. routing_profile
  // is spliced into the URL path unencoded, and encodeExcludeClient only
  // escapes ',', '(', ')' and spaces. Server-side input is zod-validated
  // before it reaches buildDirectionsRequestUrl; this mirrors those
  // guarantees for the client copy.
  function isSafeDirectionsParams(params) {
    if (!params || !Array.isArray(params.coordinates)) return false;
    if (params.coordinates.length < 2) return false;
    for (var i = 0; i < params.coordinates.length; i++) {
      var c = params.coordinates[i];
      if (!c || typeof c.longitude !== 'number' || !isFinite(c.longitude)) return false;
      if (typeof c.latitude !== 'number' || !isFinite(c.latitude)) return false;
    }
    if (params.routing_profile !== undefined && params.routing_profile !== null) {
      if (typeof params.routing_profile !== 'string') return false;
      if (!/^mapbox\\/[a-z-]+$/.test(params.routing_profile)) return false;
    }
    if (params.exclude !== undefined && params.exclude !== null) {
      if (typeof params.exclude !== 'string') return false;
      if (!/^[A-Za-z0-9_,.() -]+$/.test(params.exclude)) return false;
    }
    return true;
  }

  // Standard Google/Mapbox polyline decoder. Precision = 5 (default) or 6.
  function decodePolylineClient(str, precision) {
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

  function coordsLookSaneClient(coords) {
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      if (!Array.isArray(c) || c.length !== 2) return false;
      if (c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90) return false;
    }
    return true;
  }

  // Mapbox Directions can return geometry in 3 shapes:
  //   - GeoJSON  : { type: 'LineString', coordinates: [[lng,lat], ...] }
  //   - polyline : "encoded_string"  (precision 5, default)
  //   - polyline6: "encoded_string"  (precision 6)
  // We always request geometries=geojson ourselves, but accept all three
  // in case the API ever falls back.
  function pickRouteGeometryClient(route) {
    if (!route || !route.geometry) return null;
    var g = route.geometry;
    if (typeof g === 'object' && Array.isArray(g.coordinates) && g.coordinates.length) {
      return g.coordinates;
    }
    if (typeof g === 'string' && g.length > 0) {
      var coords = decodePolylineClient(g, 5);
      if (coords.length > 0 && coordsLookSaneClient(coords)) return coords;
      coords = decodePolylineClient(g, 6);
      if (coords.length > 0 && coordsLookSaneClient(coords)) return coords;
    }
    return null;
  }

  function buildDirectionsSummary(route) {
    var parts = [];
    if (typeof route.distance === 'number') {
      parts.push((route.distance / 1609.34).toFixed(1) + ' mi');
    }
    if (typeof route.duration === 'number') {
      parts.push(Math.round(route.duration / 60) + ' min');
    }
    return parts.length ? 'Route: ' + parts.join(', ') : 'Route';
  }

  function buildDirectionsMiniPayload(coords, route) {
    return {
      summary: buildDirectionsSummary(route),
      layers: [
        {
          id: 'selffetch-directions-route',
          type: 'line',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {}
          },
          paint: { 'line-color': '#3b82f6', 'line-width': 5 },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        }
      ],
      markers: [
        { coordinates: coords[0], style: 'start', popup: 'Start' },
        { coordinates: coords[coords.length - 1], style: 'end', popup: 'End' }
      ]
    };
  }

  function selfFetchDirections(params) {
    if (!TOKEN || !isSafeDirectionsParams(params)) {
      showError('Could not fetch route: missing token or invalid parameters.');
      return;
    }
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
        var route = data && data.routes && data.routes[0];
        var coords = route ? pickRouteGeometryClient(route) : null;
        if (!coords) {
          showError('Directions API returned no route.');
          return;
        }
        mergeAdditionalPayload(buildDirectionsMiniPayload(coords, route));
      })
      .catch(function(err) {
        showError(
          'Could not fetch route: ' + (err && err.message ? err.message : err)
        );
      });
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
