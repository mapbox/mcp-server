// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { MapAppPayload } from '../../utils/mapAppPayload.js';

/**
 * Render the generic Mapbox MCP App HTML — served by the MCP Apps resource
 * (`MapAppUIResource`) that `render_map_tool` targets exclusively via
 * postMessage delivery.
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

    // Self-fetched layers (e.g. a directions route, isochrone contours, a
    // map-matched trace, or search results): the ref only carried the
    // tool's own input params, so fetch and draw them ourselves now that
    // the map is up, rather than depend on server-computed geometry.
    if (Array.isArray(payload.selfFetch)) {
      payload.selfFetch.forEach(function(sf) {
        if (!sf) return;
        if (sf.tool === 'directions') selfFetchDirections(sf.params);
        else if (sf.tool === 'isochrone') selfFetchIsochrone(sf.params);
        else if (sf.tool === 'map_matching') selfFetchMapMatching(sf.params);
        else if (sf.tool === 'search') selfFetchSearch(sf.params);
        else if (sf.tool === 'category_search') selfFetchCategorySearch(sf.params);
        else if (sf.tool === 'optimization') selfFetchOptimization(sf.params);
        else if (sf.tool === 'ground_location') selfFetchGroundLocation(sf.params);
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
    if (params.exclude) {
      qp.append('exclude', params.exclude);
    }

    return apiEndpoint + 'directions/v5/' + profile + '/' + encodedCoords + '?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildDirectionsApiUrl = buildDirectionsApiUrl;

  // params came from the ref (attacker-controlled if a sibling frame could
  // forge postMessages) and get interpolated into the request URL.
  // coordinates and exclude are both passed through URLSearchParams above,
  // which percent-encodes them safely regardless of content — routing_profile
  // is the one value spliced into the URL *path* unencoded, so its shape is
  // restricted here. The exclude check below is defense-in-depth against a
  // malformed ref, not a compensating control for an encoding gap.
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

  // --- Self-fetch: isochrone --------------------------------------------
  // Mirrors src/tools/isochrone-tool/buildIsochroneRequestUrl.ts — kept in
  // sync by the parity test in
  // test/resources/ui-apps/isochroneSelfFetchUrlParity.test.ts.
  function buildIsochroneApiUrl(params, publicToken, apiEndpoint) {
    var profile = params.profile || 'mapbox/driving-traffic';
    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    if (params.contours_minutes && params.contours_minutes.length > 0) {
      qp.append('contours_minutes', params.contours_minutes.join(','));
    }
    if (params.contours_meters && params.contours_meters.length > 0) {
      qp.append('contours_meters', params.contours_meters.join(','));
    }
    if (params.contours_colors && params.contours_colors.length > 0) {
      qp.append('contours_colors', params.contours_colors.join(','));
    }
    if (params.polygons) {
      qp.append('polygons', String(params.polygons));
    }
    if (params.denoise) {
      qp.append('denoise', String(params.denoise));
    }
    if (params.generalize) {
      qp.append('generalize', String(params.generalize));
    }
    if (params.exclude && params.exclude.length > 0) {
      qp.append('exclude', params.exclude.join(','));
    }
    if (params.depart_at) {
      qp.append('depart_at', params.depart_at);
    }
    return apiEndpoint + 'isochrone/v1/' + profile + '/' +
      params.coordinates.longitude + '%2C' + params.coordinates.latitude +
      '?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildIsochroneApiUrl = buildIsochroneApiUrl;

  // params came from the ref and get interpolated into the request URL —
  // profile is spliced into the URL path unencoded, so validate it the
  // same way isSafeDirectionsParams validates routing_profile. Every
  // other field goes through URLSearchParams.append, which percent-encodes
  // automatically, so no extra charset validation is needed there.
  function isSafeIsochroneParams(params) {
    if (!params || !params.coordinates) return false;
    var c = params.coordinates;
    if (typeof c.longitude !== 'number' || !isFinite(c.longitude)) return false;
    if (typeof c.latitude !== 'number' || !isFinite(c.latitude)) return false;
    if (params.profile !== undefined && params.profile !== null) {
      if (typeof params.profile !== 'string') return false;
      if (!/^mapbox\\/[a-z-]+$/.test(params.profile)) return false;
    }
    return true;
  }

  var ISO_HEX6_RE = /^[0-9a-fA-F]{6}$/;
  function sanitizeHexClient(raw, fallback) {
    if (typeof raw !== 'string') return fallback;
    var bare = raw.replace(/^#/, '');
    return ISO_HEX6_RE.test(bare) ? '#' + bare : fallback;
  }

  // Mirrors buildIsochroneMapPayload (formerly server-side in
  // IsochroneTool.ts, now client-only since the map preview self-fetches).
  function buildIsochroneMiniPayload(data, params) {
    var fc = data;
    if (!fc || fc.type !== 'FeatureCollection' ||
        !Array.isArray(fc.features) || fc.features.length === 0) {
      return null;
    }

    // Render contours largest-first → smallest-on-top for a clean layered look.
    var ordered = fc.features.slice().reverse();
    var layers = [];
    ordered.forEach(function(feature, i) {
      var props = feature.properties || {};
      var color = sanitizeHexClient(props.color || props.fillColor, '#3b82f6');
      var fillOpacity = (typeof props.fillOpacity === 'number') ? props.fillOpacity : 0.25;

      if (feature.geometry && feature.geometry.type === 'Polygon' && feature.geometry.coordinates) {
        layers.push({
          id: 'selffetch-isochrone-fill-' + i,
          type: 'fill',
          data: { type: 'Feature', geometry: feature.geometry, properties: {} },
          paint: { 'fill-color': color, 'fill-opacity': fillOpacity }
        });
      }
      layers.push({
        id: 'selffetch-isochrone-line-' + i,
        type: 'line',
        data: { type: 'Feature', geometry: feature.geometry, properties: {} },
        paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      });
    });

    var mode = (params.profile || 'mapbox/driving-traffic').replace('mapbox/', '').replace('-', ' ');
    var summary = 'Isochrone: ' + fc.features.length + ' contour' + (fc.features.length !== 1 ? 's' : '');
    if (params.contours_minutes && params.contours_minutes.length > 0) {
      summary = 'Reachable by ' + mode + ': ' + params.contours_minutes.map(function(m) {
        return m + ' min';
      }).join(', ');
    } else if (params.contours_meters && params.contours_meters.length > 0) {
      summary = 'Reachable by ' + mode + ': ' + params.contours_meters.map(function(m) {
        return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : m + ' m';
      }).join(', ');
    }

    return {
      summary: summary,
      layers: layers,
      markers: [
        {
          coordinates: [params.coordinates.longitude, params.coordinates.latitude],
          style: 'pin',
          color: '#0f172a',
          popup: 'Origin'
        }
      ]
    };
  }

  function selfFetchIsochrone(params) {
    if (!TOKEN || !isSafeIsochroneParams(params)) {
      showError('Could not fetch isochrone: missing token or invalid parameters.');
      return;
    }
    var url = buildIsochroneApiUrl(params, TOKEN, API_ENDPOINT);
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
                  : 'Isochrone API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        var mini = buildIsochroneMiniPayload(data, params);
        if (!mini) {
          showError('Isochrone API returned no contours.');
          return;
        }
        mergeAdditionalPayload(mini);
      })
      .catch(function(err) {
        showError(
          'Could not fetch isochrone: ' + (err && err.message ? err.message : err)
        );
      });
  }

  // --- Self-fetch: map matching ----------------------------------------
  // Mirrors src/tools/map-matching-tool/buildMapMatchingRequestUrl.ts —
  // kept in sync by the parity test in
  // test/resources/ui-apps/mapMatchingSelfFetchUrlParity.test.ts. Always
  // forces geometries=geojson and overview=full for the self-fetch itself,
  // regardless of what the original tool call requested, so the map
  // preview never depends on it.
  var MAP_MATCHING_PROFILES = ['driving', 'driving-traffic', 'walking', 'cycling'];

  function buildMapMatchingApiUrl(params, publicToken, apiEndpoint) {
    var coordsString = params.coordinates
      .map(function(c) { return c.longitude + ',' + c.latitude; })
      .join(';');
    var profile = params.profile || 'driving';

    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    qp.append('geometries', 'geojson');
    qp.append('overview', 'full');
    if (params.timestamps) {
      qp.append('timestamps', params.timestamps.join(';'));
    }
    if (params.radiuses) {
      qp.append('radiuses', params.radiuses.join(';'));
    }
    if (params.annotations && params.annotations.length > 0) {
      qp.append('annotations', params.annotations.join(','));
    }

    return apiEndpoint + 'matching/v5/mapbox/' + profile + '/' + coordsString +
      '?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildMapMatchingApiUrl = buildMapMatchingApiUrl;

  // profile is spliced into the URL path unencoded, so it must be one of
  // the known enum values rather than any string. Coordinates get
  // interpolated directly too, so must be finite numbers.
  function isSafeMapMatchingParams(params) {
    if (!params || !Array.isArray(params.coordinates)) return false;
    if (params.coordinates.length < 2) return false;
    for (var i = 0; i < params.coordinates.length; i++) {
      var c = params.coordinates[i];
      if (!c || typeof c.longitude !== 'number' || !isFinite(c.longitude)) return false;
      if (typeof c.latitude !== 'number' || !isFinite(c.latitude)) return false;
    }
    if (params.profile !== undefined && params.profile !== null) {
      if (MAP_MATCHING_PROFILES.indexOf(params.profile) === -1) return false;
    }
    return true;
  }

  // Mirrors the deleted server-side buildMapMatchingPayload (now
  // client-only since the map preview self-fetches): raw GPS trace as a
  // dashed orange line, matched route as a solid blue line.
  function buildMapMatchingMiniPayload(data, params) {
    var match = data && data.matchings && data.matchings[0];
    if (!match || !match.geometry || !Array.isArray(match.geometry.coordinates) ||
        match.geometry.coordinates.length === 0) {
      return null;
    }

    var rawCoords = params.coordinates.map(function(c) {
      return [c.longitude, c.latitude];
    });
    var matchedCoords = match.geometry.coordinates;

    var tracepoints = data.tracepoints || [];
    var matched = tracepoints.filter(function(t) { return t != null; }).length;
    var total = tracepoints.length || params.coordinates.length;
    var confidencePct = Math.round((match.confidence || 0) * 100);

    return {
      summary: 'Matched ' + matched + '/' + total + ' GPS points (confidence ' + confidencePct + '%)',
      layers: [
        {
          id: 'selffetch-map-matching-raw',
          type: 'line',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: rawCoords }, properties: {} },
          paint: {
            'line-color': '#f97316',
            'line-width': 2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.8
          },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        },
        {
          id: 'selffetch-map-matching-matched',
          type: 'line',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: matchedCoords }, properties: {} },
          paint: { 'line-color': '#3b82f6', 'line-width': 4 },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        }
      ],
      legend: [
        { label: 'Raw trace', color: '#f97316' },
        { label: 'Matched route', color: '#3b82f6' }
      ]
    };
  }

  function selfFetchMapMatching(params) {
    if (!TOKEN || !isSafeMapMatchingParams(params)) {
      showError('Could not fetch map match: missing token or invalid parameters.');
      return;
    }
    var url = buildMapMatchingApiUrl(params, TOKEN, API_ENDPOINT);
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
                  : 'Map Matching API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        if (data && data.code !== 'Ok') {
          showError('Map Matching API could not match the trace (code: ' + data.code + ').');
          return;
        }
        var mini = buildMapMatchingMiniPayload(data, params);
        if (!mini) {
          showError('Map Matching API returned no matched route.');
          return;
        }
        mergeAdditionalPayload(mini);
      })
      .catch(function(err) {
        showError(
          'Could not fetch map match: ' + (err && err.message ? err.message : err)
        );
      });
  }

  // --- Self-fetch: search / geocode --------------------------------------
  // Mirrors src/tools/search-and-geocode-tool/buildSearchAndGeocodeRequestUrl.ts
  // — kept in sync by the parity test in
  // test/resources/ui-apps/searchSelfFetchUrlParity.test.ts. Every param
  // goes through URLSearchParams.append (nothing is spliced unencoded into
  // the URL path), so there's no charset validation to mirror here beyond
  // requiring "q" to be a string.
  function buildSearchAndGeocodeApiUrl(params, publicToken, apiEndpoint) {
    var qp = new URLSearchParams();
    qp.append('q', params.q);
    qp.append('access_token', publicToken);
    if (params.language) {
      qp.append('language', params.language);
    }
    qp.append('limit', '10');
    if (params.proximity) {
      qp.append('proximity', params.proximity.longitude + ',' + params.proximity.latitude);
    }
    if (params.bbox) {
      qp.append(
        'bbox',
        params.bbox.minLongitude + ',' + params.bbox.minLatitude + ',' +
          params.bbox.maxLongitude + ',' + params.bbox.maxLatitude
      );
    }
    if (params.country && params.country.length > 0) {
      qp.append('country', params.country.join(','));
    }
    if (params.types && params.types.length > 0) {
      qp.append('types', params.types.join(','));
    }
    if (params.poi_category && params.poi_category.length > 0) {
      qp.append('poi_category', params.poi_category.join(','));
    }
    if (params.auto_complete !== undefined && params.auto_complete !== null) {
      qp.append('auto_complete', String(params.auto_complete));
    }
    if (params.eta_type) {
      qp.append('eta_type', params.eta_type);
    }
    if (params.navigation_profile) {
      qp.append('navigation_profile', params.navigation_profile);
    }
    if (params.origin) {
      qp.append('origin', params.origin.longitude + ',' + params.origin.latitude);
    }
    return apiEndpoint + 'search/searchbox/v1/forward?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildSearchAndGeocodeApiUrl = buildSearchAndGeocodeApiUrl;

  function isSafeSearchParams(params) {
    return !!params && typeof params.q === 'string' && params.q.length > 0;
  }

  // Mirrors src/tools/search-and-geocode-tool/buildSearchMapPayload.ts
  // (formerly server-side, now client-only since the map preview
  // self-fetches). Shared by search_and_geocode_tool and
  // category_search_tool self-fetch — both return the same Search Box
  // FeatureCollection shape.
  function buildSearchMiniPayload(data, query, proximity) {
    var fc = data;
    if (!fc || !Array.isArray(fc.features)) return null;

    var points = fc.features.filter(function(f) {
      return f.geometry && f.geometry.type === 'Point' &&
        Array.isArray(f.geometry.coordinates) &&
        typeof f.geometry.coordinates[0] === 'number' &&
        typeof f.geometry.coordinates[1] === 'number';
    });
    if (points.length === 0 && !proximity) return null;

    var markers = [];
    if (proximity) {
      markers.push({
        coordinates: [proximity.longitude, proximity.latitude],
        style: 'pin',
        color: '#0f172a',
        popup: 'Search center'
      });
    }

    var features = [];
    points.forEach(function(f, i) {
      var props = f.properties || {};
      var popupParts = [(i + 1) + '. ' + (props.name || 'Result')];
      var addr = props.full_address || props.place_formatted;
      if (addr) popupParts.push(addr);
      if (typeof props.distance === 'number') {
        popupParts.push(Math.round(props.distance) + ' m');
      }
      var coords = f.geometry.coordinates;
      markers.push({
        coordinates: coords,
        style: 'numbered',
        label: String(i + 1),
        color: '#f97316',
        popup: popupParts.join(' — ')
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: { idx: i + 1, label: props.name || ('Result ' + (i + 1)) }
      });
    });

    var summary = query
      ? points.length + ' result' + (points.length !== 1 ? 's' : '') + ' for "' + query + '"'
      : points.length + ' result' + (points.length !== 1 ? 's' : '');

    var layers = features.length > 0 ? [
      {
        id: 'selffetch-search-results',
        type: 'circle',
        data: { type: 'FeatureCollection', features: features },
        paint: {
          'circle-radius': 6,
          'circle-color': '#f97316',
          'circle-opacity': 0.15,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#f97316',
          'circle-stroke-opacity': 0.4
        }
      }
    ] : [];

    return { summary: summary, layers: layers, markers: markers };
  }

  function selfFetchSearch(params) {
    if (!TOKEN || !isSafeSearchParams(params)) {
      showError('Could not fetch search results: missing token or invalid parameters.');
      return;
    }
    var url = buildSearchAndGeocodeApiUrl(params, TOKEN, API_ENDPOINT);
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
                  : 'Search API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        var fc = data;
        // Elicitation resolved to one specific result earlier — filter the
        // freshly-fetched results down to that one. If ranking shifted
        // enough that it's no longer present, fall back to showing all
        // fresh results rather than nothing.
        if (params.selectedMapboxId && fc && Array.isArray(fc.features)) {
          var match = fc.features.filter(function(f) {
            return f.properties && f.properties.mapbox_id === params.selectedMapboxId;
          });
          if (match.length > 0) fc = { type: 'FeatureCollection', features: match };
        }
        var mini = buildSearchMiniPayload(fc, params.q, params.proximity);
        if (!mini) {
          showError('Search API returned no results.');
          return;
        }
        mergeAdditionalPayload(mini);
      })
      .catch(function(err) {
        showError(
          'Could not fetch search results: ' + (err && err.message ? err.message : err)
        );
      });
  }

  // --- Self-fetch: category search ---------------------------------------
  // Mirrors src/tools/category-search-tool/buildCategorySearchRequestUrl.ts
  // — kept in sync by the parity test in
  // test/resources/ui-apps/categorySearchSelfFetchUrlParity.test.ts. Shares
  // buildSearchMiniPayload with the plain search self-fetch above — both
  // return the same Search Box FeatureCollection shape.
  function buildCategorySearchApiUrl(params, publicToken, apiEndpoint) {
    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    if (params.language) {
      qp.append('language', params.language);
    }
    if (params.limit !== undefined && params.limit !== null) {
      qp.append('limit', String(params.limit));
    }
    if (params.proximity) {
      qp.append('proximity', params.proximity.longitude + ',' + params.proximity.latitude);
    }
    if (params.bbox) {
      qp.append(
        'bbox',
        params.bbox.minLongitude + ',' + params.bbox.minLatitude + ',' +
          params.bbox.maxLongitude + ',' + params.bbox.maxLatitude
      );
    }
    if (params.country && params.country.length > 0) {
      qp.append('country', params.country.join(','));
    }
    if (params.poi_category_exclusions && params.poi_category_exclusions.length > 0) {
      qp.append('poi_category_exclusions', params.poi_category_exclusions.join(','));
    }
    return apiEndpoint + 'search/searchbox/v1/category/' +
      encodeURIComponent(params.category) + '?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildCategorySearchApiUrl = buildCategorySearchApiUrl;

  function isSafeCategorySearchParams(params) {
    return !!params && typeof params.category === 'string' && params.category.length > 0;
  }

  function selfFetchCategorySearch(params) {
    if (!TOKEN || !isSafeCategorySearchParams(params)) {
      showError('Could not fetch category search results: missing token or invalid parameters.');
      return;
    }
    var url = buildCategorySearchApiUrl(params, TOKEN, API_ENDPOINT);
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
                  : 'Category Search API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        var mini = buildSearchMiniPayload(data, params.category, params.proximity);
        if (!mini) {
          showError('Category Search API returned no results.');
          return;
        }
        mergeAdditionalPayload(mini);
      })
      .catch(function(err) {
        showError(
          'Could not fetch category search results: ' + (err && err.message ? err.message : err)
        );
      });
  }

  // --- Self-fetch: trip optimization --------------------------------------
  // Mirrors src/tools/optimization-tool/buildOptimizationRequestUrl.ts —
  // kept in sync by the parity test in
  // test/resources/ui-apps/optimizationSelfFetchUrlParity.test.ts. Always
  // forces geometries=geojson and overview=full for the self-fetch itself
  // — overview defaults to 'simplified' (and could even be 'false') on the
  // original call, either of which would otherwise leave the map preview
  // with no geometry to draw.
  var OPTIMIZATION_PROFILES = ['mapbox/driving', 'mapbox/walking', 'mapbox/cycling', 'mapbox/driving-traffic'];

  function buildOptimizationApiUrl(params, publicToken, apiEndpoint) {
    var coordsString = params.coordinates
      .map(function(c) { return c.longitude + ',' + c.latitude; })
      .join(';');
    var profile = params.profile || 'mapbox/driving';

    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    if (params.source) {
      qp.append('source', params.source);
    }
    if (params.destination) {
      qp.append('destination', params.destination);
    }
    qp.append('roundtrip', String(params.roundtrip));
    qp.append('geometries', 'geojson');
    qp.append('overview', 'full');
    if (params.steps !== undefined && params.steps !== null) {
      qp.append('steps', String(params.steps));
    }
    if (params.annotations && params.annotations.length > 0) {
      qp.append('annotations', params.annotations.join(','));
    }
    if (params.language) {
      qp.append('language', params.language);
    }

    return apiEndpoint + 'optimized-trips/v1/' + profile + '/' + coordsString +
      '?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildOptimizationApiUrl = buildOptimizationApiUrl;

  // profile is spliced into the URL path unencoded, so it must be one of
  // the known enum values rather than any string. Coordinates get
  // interpolated directly too, so must be finite numbers.
  function isSafeOptimizationParams(params) {
    if (!params || !Array.isArray(params.coordinates) || params.coordinates.length < 2) {
      return false;
    }
    for (var i = 0; i < params.coordinates.length; i++) {
      var c = params.coordinates[i];
      if (!c || typeof c.longitude !== 'number' || !isFinite(c.longitude)) return false;
      if (typeof c.latitude !== 'number' || !isFinite(c.latitude)) return false;
    }
    if (params.profile !== undefined && params.profile !== null) {
      if (OPTIMIZATION_PROFILES.indexOf(params.profile) === -1) return false;
    }
    return true;
  }

  // Mirrors the deleted server-side buildOptimizationMapPayload (now
  // client-only since the map preview self-fetches): a single trip line
  // plus numbered visit-order markers (start=green, end=red, middle=blue).
  function buildOptimizationMiniPayload(data, params) {
    var trip = data && data.trips && data.trips[0];
    if (!trip || !trip.geometry || !Array.isArray(trip.geometry.coordinates) ||
        trip.geometry.coordinates.length === 0) {
      return null;
    }

    var waypoints = data.waypoints || [];
    var ordered = waypoints.map(function(wp, inputIndex) {
      return { wp: wp, inputIndex: inputIndex };
    }).sort(function(a, b) { return a.wp.waypoint_index - b.wp.waypoint_index; });

    var markers = ordered.map(function(entry, i) {
      var isStart = i === 0;
      var isEnd = i === ordered.length - 1;
      var color = isStart ? '#22c55e' : isEnd ? '#ef4444' : '#2563eb';
      var popupParts = ['Stop ' + (i + 1) + ' (input #' + entry.inputIndex + ')'];
      // wp.name is the snapped road name, not a place name — label accordingly.
      if (entry.wp.name) popupParts.push('on ' + entry.wp.name);
      return {
        coordinates: entry.wp.location,
        style: 'numbered',
        label: String(i + 1),
        color: color,
        popup: popupParts.join(' — ')
      };
    });

    var miles = (trip.distance / 1609.34).toFixed(1);
    var minutes = Math.round(trip.duration / 60);
    var summary = 'Optimized trip: ' + miles + ' mi, ' + minutes + ' min';

    return {
      summary: summary,
      layers: [
        {
          id: 'selffetch-optimization-trip',
          type: 'line',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: trip.geometry.coordinates }, properties: {} },
          paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 },
          layout: { 'line-join': 'round', 'line-cap': 'round' }
        }
      ],
      markers: markers
    };
  }

  function selfFetchOptimization(params) {
    if (!TOKEN || !isSafeOptimizationParams(params)) {
      showError('Could not fetch optimized trip: missing token or invalid parameters.');
      return;
    }
    var url = buildOptimizationApiUrl(params, TOKEN, API_ENDPOINT);
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
                  : 'Optimization API error (' + res.status + ')';
              throw new Error(msg);
            });
        }
        return res.json();
      })
      .then(function(data) {
        if (data && data.code !== 'Ok') {
          showError('Optimization API error (code: ' + data.code + ').');
          return;
        }
        var mini = buildOptimizationMiniPayload(data, params);
        if (!mini) {
          showError('Optimization API returned no trip.');
          return;
        }
        mergeAdditionalPayload(mini);
      })
      .catch(function(err) {
        showError(
          'Could not fetch optimized trip: ' + (err && err.message ? err.message : err)
        );
      });
  }

  // --- Self-fetch: ground location -----------------------------------------
  // Mirrors src/tools/ground-location-tool/buildReverseGeocodeUrl.ts —
  // kept in sync by the parity test in
  // test/resources/ui-apps/groundLocationSelfFetchUrlParity.test.ts. The POI
  // sub-fetch (if any) reuses buildCategorySearchApiUrl above rather than
  // duplicating it. The sampling-derived strategy that decided geocodeTypes
  // and whether a POI fetch is needed was already resolved server-side (the
  // iframe can't invoke MCP sampling itself) and is carried in the ref.
  function buildReverseGeocodeApiUrl(input, publicToken, apiEndpoint) {
    var qp = new URLSearchParams();
    qp.append('longitude', String(input.longitude));
    qp.append('latitude', String(input.latitude));
    qp.append('access_token', publicToken);
    qp.append('limit', '1');
    qp.append('types', input.types);
    if (input.language) {
      qp.append('language', input.language);
    }
    return apiEndpoint + 'search/geocode/v6/reverse?' + qp.toString();
  }
  // Exposed so the parity test (Node vm sandbox) can call this in isolation.
  window.__buildReverseGeocodeApiUrl = buildReverseGeocodeApiUrl;

  function isSafeGroundLocationParams(params) {
    if (!params) return false;
    if (typeof params.longitude !== 'number' || !isFinite(params.longitude)) return false;
    if (typeof params.latitude !== 'number' || !isFinite(params.latitude)) return false;
    if (typeof params.geocodeTypes !== 'string' || params.geocodeTypes.length === 0) return false;
    return true;
  }

  // Mirrors the deleted server-side buildGroundLocationPayload (now
  // client-only since the map preview self-fetches): a dark origin pin plus
  // numbered orange POI markers. Isochrone contours aren't drawn here either
  // — the original never rendered them, only a contour-minutes summary.
  function buildGroundLocationMiniPayload(place, longitude, latitude, pois) {
    var markers = [
      {
        coordinates: [longitude, latitude],
        style: 'pin',
        color: '#0f172a',
        popup: place
      }
    ];
    (pois || []).forEach(function(poi, i) {
      var parts = [(i + 1) + '. ' + poi.name];
      if (poi.address) parts.push(poi.address);
      if (typeof poi.distance_meters === 'number') {
        parts.push(Math.round(poi.distance_meters) + ' m');
      }
      markers.push({
        coordinates: [poi.longitude, poi.latitude],
        style: 'numbered',
        label: String(i + 1),
        color: '#f97316',
        popup: parts.join(' — ')
      });
    });
    return { summary: place, layers: [], markers: markers };
  }

  function selfFetchGroundLocation(params) {
    if (!TOKEN || !isSafeGroundLocationParams(params)) {
      showError('Could not fetch location context: missing token or invalid parameters.');
      return;
    }
    var geocodeUrl = buildReverseGeocodeApiUrl(
      {
        longitude: params.longitude,
        latitude: params.latitude,
        types: params.geocodeTypes,
        language: params.language
      },
      TOKEN,
      API_ENDPOINT
    );
    var geocodePromise = fetch(geocodeUrl)
      .then(function(res) { return res.ok ? res.json() : null; })
      .catch(function() { return null; });

    var poiPromise;
    if (params.poi && typeof params.poi.query === 'string') {
      var poiUrl = buildCategorySearchApiUrl(
        {
          category: params.poi.query,
          proximity: { longitude: params.longitude, latitude: params.latitude },
          limit: params.poi.limit,
          language: params.language
        },
        TOKEN,
        API_ENDPOINT
      );
      poiPromise = fetch(poiUrl)
        .then(function(res) { return res.ok ? res.json() : null; })
        .catch(function() { return null; });
    } else {
      poiPromise = Promise.resolve(null);
    }

    Promise.all([geocodePromise, poiPromise]).then(function(results) {
      var geocodeData = results[0];
      var poiData = results[1];

      var feature = geocodeData && Array.isArray(geocodeData.features)
        ? geocodeData.features[0]
        : null;
      var place = (feature && feature.properties && feature.properties.name) ||
        (params.latitude + ', ' + params.longitude);

      var poiFeatures = (poiData && Array.isArray(poiData.features)) ? poiData.features : [];
      var pois = poiFeatures.map(function(f) {
        var props = f.properties || {};
        var coords = (f.geometry && f.geometry.coordinates) || [params.longitude, params.latitude];
        return {
          name: props.name || 'Unknown',
          address: props.full_address || props.place_formatted,
          longitude: coords[0],
          latitude: coords[1],
          distance_meters: props.distance
        };
      });

      var mini = buildGroundLocationMiniPayload(place, params.longitude, params.latitude, pois);
      mergeAdditionalPayload(mini);
    }).catch(function(err) {
      showError(
        'Could not fetch location context: ' + (err && err.message ? err.message : err)
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
