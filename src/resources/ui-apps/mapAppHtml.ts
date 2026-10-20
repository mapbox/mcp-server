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
  /* Light and dark, following the host's theme (see applyHostContext), or
     the system's when the host sends none. Colors come from the host's own
     style variables (MCP Apps hostContext.styles) when it sends them, so
     the cards match the chat around them; the fallbacks are used
     otherwise. The map, its pins and their name labels stay as they are. */
  :root {
    color-scheme: light;
    --ui-surface: var(--color-background-primary, #ffffff);
    --ui-surface-muted: var(--color-background-secondary, #f1f5f9);
    --ui-text: var(--color-text-primary, #0f172a);
    --ui-text-muted: var(--color-text-secondary, #475569);
    --ui-icon-muted: #64748b;
    --ui-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
    --ui-error-bg: #ffebee; --ui-error-text: #b71c1c;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ui-surface: var(--color-background-primary, #0f172a);
    --ui-surface-muted: var(--color-background-secondary, #1e293b);
    --ui-text: var(--color-text-primary, #f1f5f9);
    --ui-text-muted: var(--color-text-secondary, #cbd5e1);
    --ui-icon-muted: #94a3b8;
    --ui-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    --ui-error-bg: #3b1214; --ui-error-text: #fca5a5;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #map { position: absolute; inset: 0; }
  #summary {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    background: var(--ui-surface); color: var(--ui-text);
    padding: 8px 12px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    box-shadow: var(--ui-shadow);
    max-width: calc(100% - 24px); white-space: pre-line;
  }
  #legend {
    position: absolute; bottom: 12px; left: 12px; z-index: 10;
    background: var(--ui-surface); color: var(--ui-text);
    padding: 8px 12px; border-radius: 6px;
    font-size: 11px; box-shadow: var(--ui-shadow);
  }
  #legend .row { display: flex; align-items: center; margin: 2px 0; }
  #legend .swatch {
    display: inline-block; width: 14px; height: 14px;
    margin-right: 6px; border-radius: 3px;
  }
  #loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: var(--ui-text-muted); font-size: 16px; z-index: 10; pointer-events: none;
  }
  #error {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: var(--ui-error-text); background: var(--ui-error-bg); border-radius: 8px;
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
  /* Selected place (see selectPlace): the pin inverts and shows its name,
     like the card it matches. */
  .marker-badge.active {
    background: #fff !important; color: #0f172a !important;
    transform: scale(1.18); box-shadow: 0 3px 10px rgba(0,0,0,0.5);
  }
  .marker-badge .marker-name {
    display: none; position: absolute; top: 32px; left: 50%; transform: translateX(-50%);
    white-space: nowrap; font-size: 11px; font-weight: 600; color: #0f172a;
    background: rgba(255,255,255,0.92); padding: 1px 6px; border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3); pointer-events: none;
  }
  .marker-badge.active .marker-name { display: block; }
  /* A place pin (search results and other places in the carousel): a
     white disc with the place's Maki icon, black when selected. Numbered
     badges stay for markers whose number means something (visit order). */
  .marker-badge.place {
    width: 30px; height: 30px; background: #fff; color: #0f172a;
    border: none; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
  }
  .marker-badge.place svg { width: 16px; height: 16px; display: block; }
  .marker-badge.place.active {
    background: #0f172a !important; color: #fff !important;
  }
  /* Results carousel. Sits above the Mapbox logo and attribution, which
     must stay visible; the legend moves up above it (see showCarousel). */
  #carousel { position: absolute; left: 0; right: 0; bottom: 36px; z-index: 10; }
  #carousel .card-list {
    list-style: none; margin: 0; padding: 4px 32px 6px;
    display: flex; gap: 10px; overflow-x: auto; overflow-y: hidden;
    scroll-snap-type: x mandatory; scrollbar-width: none;
  }
  #carousel .card-list::-webkit-scrollbar { display: none; }
  #carousel .card {
    flex: 0 0 auto; width: 300px; max-width: calc(100vw - 64px); min-height: 84px;
    scroll-snap-align: center;
    display: flex; align-items: center; gap: 10px; padding: 10px;
    background: var(--ui-surface); color: var(--ui-text);
    border: 2px solid transparent; border-radius: 14px;
    box-shadow: var(--ui-shadow); cursor: pointer;
  }
  #carousel .card.active { border-color: var(--ui-text); }
  /* Added once a photo loads (see loadPanelPhoto), after the text in the
     DOM but shown first. */
  #carousel .card-thumb {
    order: -1; flex: 0 0 auto; width: 64px; height: 64px; border-radius: 10px;
    background-size: cover; background-position: center;
  }
  /* Until a photo loads, or when the place has none: the place's icon
     on a muted tile, so every card has a picture. */
  #carousel .card-thumb.empty {
    background: var(--ui-surface-muted); color: var(--ui-icon-muted);
    display: flex; align-items: center; justify-content: center;
  }
  #carousel .card-thumb.empty svg { width: 28px; height: 28px; display: block; }
  /* Matches the numbered pin. */
  #carousel .card-badge {
    flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
    background: #f97316; color: #1a0f04;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700;
  }
  #carousel .card-body { flex: 1 1 auto; min-width: 0; }
  #carousel .card-name {
    font-size: 14px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #carousel .card-meta, #carousel .card-extra {
    font-size: 12px; color: var(--ui-text-muted); margin-top: 3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary" style="display:none"></div>
<div id="legend" style="display:none"></div>
<div id="carousel" style="display:none"></div>
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
  var carouselEl = document.getElementById('carousel');
  // Populated by buildSearchMiniPayload's marker tagging so the carousel (card
  // <-> pin) and Place Details enrichment can find a marker by mapbox_id
  // without re-querying the map for it.
  var markersById = {};

  var map = null;
  var mapLoaded = false;
  var pendingPayload = null;
  // Tracks which base style the map is currently constructed with, so a
  // later render() can detect a baseStyle change and switch via setStyle()
  // -- the style is otherwise only ever set once, at construction time.
  var currentBaseStyleId = 'standard';
  var currentDisplayMode = 'inline';

  // Tracks what we've added so re-renders can tear down cleanly.
  var trackedLayerIds = [];
  var trackedSourceIds = [];
  var trackedMarkers = [];

  // --- MCP App postMessage protocol -----------------------------------------
  var messageId = 0;
  var pendingRequests = new Map();

  // timeoutMs (optional) rejects a request nobody answers, for hosts that
  // don't implement the method.
  function sendRequest(method, params, timeoutMs) {
    var id = ++messageId;
    try {
      window.parent.postMessage({
        jsonrpc: '2.0', id: id, method: method, params: params || {}
      }, '*');
    } catch (_) {}
    return new Promise(function(resolve, reject) {
      pendingRequests.set(id, { resolve: resolve, reject: reject });
      if (timeoutMs) {
        setTimeout(function() {
          if (!pendingRequests.has(id)) return;
          pendingRequests.delete(id);
          reject(new Error(method + ' timed out'));
        }, timeoutMs);
      }
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
        message.params) {
      // Partial updates: only the fields that changed are sent.
      applyHostContext(message.params);
      if (message.params.displayMode) {
        currentDisplayMode = message.params.displayMode;
        if (map) setTimeout(function() { map.resize(); }, 100);
      }
    }
  });

  // --- Light/dark theme -----------------------------------------------------
  var rootEl = document.documentElement;
  var hostTheme = null;

  function applyTheme(theme) {
    if ((theme !== 'light' && theme !== 'dark') || !rootEl) return;
    rootEl.setAttribute('data-theme', theme);
  }

  // The host's theme wins over the system's; its style variables
  // (--color-background-primary and so on) feed the --ui-* colors.
  function applyHostContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    if (ctx.theme === 'light' || ctx.theme === 'dark') {
      hostTheme = ctx.theme;
      applyTheme(hostTheme);
    }
    var vars = ctx.styles && ctx.styles.variables;
    if (vars && typeof vars === 'object' && rootEl && rootEl.style &&
        typeof rootEl.style.setProperty === 'function') {
      Object.keys(vars).forEach(function(name) {
        if (/^--[a-z0-9-]+$/i.test(name) && typeof vars[name] === 'string') {
          rootEl.style.setProperty(name, vars[name]);
        }
      });
    }
  }
  window.__applyHostContext = applyHostContext;

  var darkQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  function followSystemTheme() {
    if (!hostTheme && darkQuery) applyTheme(darkQuery.matches ? 'dark' : 'light');
  }
  followSystemTheme();
  if (darkQuery && typeof darkQuery.addEventListener === 'function') {
    darkQuery.addEventListener('change', followSystemTheme);
  }

  // Set once a host answers ui/initialize, even with an error. A page from
  // export_map_html_tool framed by some other site never gets an answer.
  var hostAnswered = false;
  sendRequest('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox Map', version: '1.0.0' }
  }).then(
    function(result) {
      hostAnswered = true;
      if (result) applyHostContext(result.hostContext);
      sendNotification('ui/notifications/initialized', {});
    },
    function() {
      hostAnswered = true;
      sendNotification('ui/notifications/initialized', {});
    }
  );

  // --- Map setup ------------------------------------------------------------
  var initialDataRead = false;
  var initialData = null;

  // Parses the #initial-data script tag once and caches the result — read
  // before map construction (to seed the constructor's config option, so
  // a baseMapConfig takes effect before first paint instead of flashing
  // default colors) and again by consumeInitialData() after load.
  function readInitialData() {
    if (initialDataRead) return initialData;
    initialDataRead = true;
    var el = document.getElementById('initial-data');
    if (el && el.textContent) {
      try { initialData = JSON.parse(el.textContent); } catch (_) { /* ignore */ }
    }
    return initialData;
  }

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
    var data = readInitialData();
    // Allowlisted rather than interpolated directly, so an unrecognized
    // value can never reach the style URL -- falls back to 'standard'.
    var baseStyleId = (data && data.baseStyle === 'standard-satellite')
      ? 'standard-satellite'
      : 'standard';
    currentBaseStyleId = baseStyleId;
    var mapOptions = {
      container: 'map',
      style: 'mapbox://styles/mapbox/' + baseStyleId,
      center: [0, 20],
      zoom: 1.5
    };
    if (data && data.baseMapConfig) {
      mapOptions.config = { basemap: data.baseMapConfig };
    }
    map = new mapboxgl.Map(mapOptions);
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
    var data = readInitialData();
    if (data && Array.isArray(data.layers)) render(data);
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
    placeTopLeftControls();
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
    markersById = {};
    carouselEl.style.display = 'none';
    legendEl.style.bottom = '';
    clearPanel();
    // Place Details responses still in flight belong to the old render.
    panelGeneration += 1;
    panelCount = 0;
    panelIds = {};
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

  // Maki icons (https://github.com/mapbox/maki, CC0), 15x15 path data, for
  // the categories search results most often have. Anything else gets
  // the plain marker.
  var MAKI = {
    'attraction': 'M6,2C5.446,2,5.2478,2.5045,5,3L4.5,4h-2C1.669,4,1,4.669,1,5.5v5C1,11.331,1.669,12,2.5,12h10 c0.831,0,1.5-0.669,1.5-1.5v-5C14,4.669,13.331,4,12.5,4h-2L10,3C9.75,2.5,9.554,2,9,2H6z M2.5,5C2.7761,5,3,5.2239,3,5.5 S2.7761,6,2.5,6S2,5.7761,2,5.5S2.2239,5,2.5,5z M7.5,5c1.6569,0,3,1.3431,3,3s-1.3431,3-3,3s-3-1.3431-3-3S5.8431,5,7.5,5z M7.5,6.5C6.6716,6.5,6,7.1716,6,8l0,0c0,0.8284,0.6716,1.5,1.5,1.5l0,0C8.3284,9.5,9,8.8284,9,8l0,0C9,7.1716,8.3284,6.5,7.5,6.5 L7.5,6.5z',
    'bakery': 'M5.294,4.382,6,9.5a.979.979,0,0,0,1,1H8a.979.979,0,0,0,1-1l.706-5.118C9.706,3,7.5,3,7.5,3S5.291,3,5.294,4.382ZM3.5,5C2,5,2,6,2,6l1,4H4.5a.793.793,0,0,0,.794-.765L4.5,5Zm-2,2.5a1.533,1.533,0,0,0-1.059.412A1.366,1.366,0,0,0,0,8.794V11H.882A1.02,1.02,0,0,0,2,10ZM11.5,5C13,5,13,6,13,6l-1,4H10.5a.793.793,0,0,1-.794-.765L10.5,5Zm2,2.5a1.533,1.533,0,0,1,1.059.412A1.366,1.366,0,0,1,15,8.794V11h-.882A1.02,1.02,0,0,1,13,10Z',
    'bank': 'M1,3C0.446,3,0,3.446,0,4v7c0,0.554,0.446,1,1,1h13c0.554,0,1-0.446,1-1V4c0-0.554-0.446-1-1-1H1z M1,4h1.5 C2.7761,4,3,4.2239,3,4.5S2.7761,5,2.5,5S2,4.7761,2,4.5L1.5,5C1.7761,5,2,5.2239,2,5.5S1.7761,6,1.5,6S1,5.7761,1,5.5V4z M7.5,4 C8.8807,4,10,5.567,10,7.5l0,0C10,9.433,8.8807,11,7.5,11S5,9.433,5,7.5S6.1193,4,7.5,4z M12.5,4H14v1.5C14,5.7761,13.7761,6,13.5,6 S13,5.7761,13,5.5S13.2239,5,13.5,5L13,4.5C13,4.7761,12.7761,5,12.5,5S12,4.7761,12,4.5S12.2239,4,12.5,4z M7.5,5.5 c-0.323,0-0.5336,0.1088-0.6816,0.25h1.3633C8.0336,5.6088,7.823,5.5,7.5,5.5z M6.625,6C6.5795,6.091,6.5633,6.1711,6.5449,6.25 h1.9102C8.4367,6.1711,8.4205,6.091,8.375,6H6.625z M6.5,6.5v0.25h2V6.5H6.5z M6.5,7v0.25h2V7H6.5z M6.5,7.5v0.25h2V7.5H6.5z M6.5,8 L6.25,8.25h2L8.5,8H6.5z M6,8.5c0,0,0.0353,0.1024,0.1016,0.25H8.375L8,8.5H6z M1.5,9C1.7761,9,2,9.2239,2,9.5S1.7761,10,1.5,10 L2,10.5C2,10.2239,2.2239,10,2.5,10S3,10.2239,3,10.5S2.7761,11,2.5,11H1V9.5C1,9.2239,1.2239,9,1.5,9z M6.2383,9 C6.2842,9.0856,6.3144,9.159,6.375,9.25h2.2676C8.7092,9.1121,8.75,9,8.75,9H6.2383z M13.5,9C13.7761,9,14,9.2239,14,9.5V11h-1.5 c-0.2761,0-0.5-0.2239-0.5-0.5s0.2239-0.5,0.5-0.5s0.5,0.2239,0.5,0.5l0.5-0.5C13.2239,10,13,9.7761,13,9.5S13.2239,9,13.5,9z M6.5664,9.5c0.0786,0.0912,0.1647,0.1763,0.2598,0.25h1.4199C8.3462,9.6727,8.4338,9.5883,8.5,9.5H6.5664z',
    'bar': 'M7.5,1c-2,0-7,0.25-6.5,0.75L7,8v4 c0,1-3,0.5-3,2h7c0-1.5-3-1-3-2V8l6-6.25C14.5,1.25,9.5,1,7.5,1z M7.5,2c2.5,0,4.75,0.25,4.75,0.25L11.5,3h-8L2.75,2.25 C2.75,2.25,5,2,7.5,2z',
    'beer': 'M12,5V2c0,0-1-1-4.5-1S3,2,3,2v3c0.0288,1.3915,0.3706,2.7586,1,4c0.6255,1.4348,0.6255,3.0652,0,4.5c0,0,0,1,3.5,1 s3.5-1,3.5-1c-0.6255-1.4348-0.6255-3.0652,0-4.5C11.6294,7.7586,11.9712,6.3915,12,5z M7.5,13.5 c-0.7966,0.035-1.5937-0.0596-2.36-0.28c0.203-0.7224,0.304-1.4696,0.3-2.22h4.12c-0.004,0.7504,0.097,1.4976,0.3,2.22 C9.0937,13.4404,8.2966,13.535,7.5,13.5z M7.5,5C6.3136,5.0299,5.1306,4.8609,4,4.5v-2C5.131,2.1411,6.3137,1.9722,7.5,2 C8.6863,1.9722,9.869,2.1411,11,2.5v2C9.8694,4.8609,8.6864,5.0299,7.5,5z',
    'cafe': 'M12,5h-2V3H2v4c0.0133,2.2091,1.8149,3.9891,4.024,3.9758C7.4345,10.9673,8.7362,10.2166,9.45,9H12c1.1046,0,2-0.8954,2-2 S13.1046,5,12,5z M12,8H9.86C9.9487,7.6739,9.9958,7.3379,10,7V6h2c0.5523,0,1,0.4477,1,1S12.5523,8,12,8z M10,12.5 c0,0.2761-0.2239,0.5-0.5,0.5h-7C2.2239,13,2,12.7761,2,12.5S2.2239,12,2.5,12h7C9.7761,12,10,12.2239,10,12.5z',
    'cinema': 'M14,7.5v2c0,0.2761-0.2239,0.5-0.5,0.5S13,9.7761,13,9.5c0,0,0.06-0.5-1-0.5h-1v2.5c0,0.2761-0.2239,0.5-0.5,0.5h-8 C2.2239,12,2,11.7761,2,11.5v-4C2,7.2239,2.2239,7,2.5,7h8C10.7761,7,11,7.2239,11,7.5V8h1c1.06,0,1-0.5,1-0.5 C13,7.2239,13.2239,7,13.5,7S14,7.2239,14,7.5z M4,3C2.8954,3,2,3.8954,2,5s0.8954,2,2,2s2-0.8954,2-2S5.1046,3,4,3z M4,6 C3.4477,6,3,5.5523,3,5s0.4477-1,1-1s1,0.4477,1,1S4.5523,6,4,6z M8.5,2C7.1193,2,6,3.1193,6,4.5S7.1193,7,8.5,7S11,5.8807,11,4.5 S9.8807,2,8.5,2z M8.5,6C7.6716,6,7,5.3284,7,4.5S7.6716,3,8.5,3S10,3.6716,10,4.5S9.3284,6,8.5,6z',
    'convenience': 'M2.9982,3.0687s.1875-1.062,1-1.062H5.0043V1.7276a.5.5,0,0,1,.5-.5H9.4882a.5.5,0,0,1,.5.5v.2791h1.01a.8324.8324,0,0,1,.6373.2937,1.7589,1.7589,0,0,1,.3627.7683s.3108,1.5719.5921,2.9181h-.938L11,3,3.982,2.9956,3.3336,5.9868H2.382Zm11,4.9144a1,1,0,0,1-.9992,1l-1.0008,3.973s-.1875,1.0417-1,1.0417h-7c-.8125,0-1-1.0417-1-1.0417L1.9822,8.98a.9985.9985,0,0,1,.016-1.9968h11A1,1,0,0,1,13.9982,7.9831ZM5.0327,12.13,5.03,11.0051,4.6392,9.4686a.5373.5373,0,1,0-1.0649.1445L3.78,11.0075l.1874,1.2672A.5373.5373,0,1,0,5.0327,12.13Zm2-2.5967A.5332.5332,0,0,0,6.4994,9l-.0039.0008L6.4886,9a.4992.4992,0,0,0-.3575.1509.529.529,0,0,0-.1648.3828v2.68a.5332.5332,0,1,0,1.0663,0Zm1.998,0A.5314.5314,0,0,0,8.694,9.04a.4992.4992,0,0,0-.393,0,.5312.5312,0,0,0-.3366.4934v2.68a.5331.5331,0,1,0,1.0662,0Zm2.3857.08a.5373.5373,0,1,0-1.0649-.1445L9.96,10.9938,9.9579,12.13a.5373.5373,0,1,0,1.0649.1446Z',
    'fast-food': 'M14,8c0,0.5523-0.4477,1-1,1H2C1.4477,9,1,8.5523,1,8s0.4477-1,1-1h11C13.5523,7,14,7.4477,14,8z M3.5,10H2 c0,1.6569,1.3431,3,3,3h5c1.6569,0,3-1.3431,3-3H3.5z M3,6H2V4c0-1.1046,0.8954-2,2-2h7c1.1046,0,2,0.8954,2,2v2H3z M11,4.5 C11,4.7761,11.2239,5,11.5,5S12,4.7761,12,4.5S11.7761,4,11.5,4S11,4.2239,11,4.5z M9,3.5C9,3.7761,9.2239,4,9.5,4S10,3.7761,10,3.5 S9.7761,3,9.5,3S9,3.2239,9,3.5z M7,4.5C7,4.7761,7.2239,5,7.5,5S8,4.7761,8,4.5S7.7761,4,7.5,4S7,4.2239,7,4.5z M5,3.5 C5,3.7761,5.2239,4,5.5,4S6,3.7761,6,3.5S5.7761,3,5.5,3S5,3.2239,5,3.5z M3,4.5C3,4.7761,3.2239,5,3.5,5S4,4.7761,4,4.5 S3.7761,4,3.5,4S3,4.2239,3,4.5z',
    'fuel': 'm14 6v5.5c0 .2761-.2239.5-.5.5s-.5-.2239-.5-.5v-2c0-.8284-.6716-1.5-1.5-1.5h-1.5v-6c0-.5523-.4477-1-1-1h-6c-.5523 0-1 .4477-1 1v11c0 .5523.4477 1 1 1h6c.5523 0 1-.4477 1-1v-4h1.5c.2761 0 .5.2239.5.5v2c0 .8284.6716 1.5 1.5 1.5s1.5-.6716 1.5-1.5v-6.5c0-.5523-.4477-1-1-1v-1.51c-.0054-.2722-.2277-.4901-.5-.49-.2816.0047-.5062.2367-.5015.5184.0002.0105.0007.0211.0015.0316v2.45c0 .5523.4477 1 1 1s1-.4477 1-1-.4477-1-1-1zm-5 .5c0 .2761-.2239.5-.5.5h-5c-.2761 0-.5-.2239-.5-.5v-3c0-.2761.2239-.5.5-.5h5c.2761 0 .5.2239.5.5z',
    'grocery': 'M 13.199219 1.5 C 13.199219 1.5 11.808806 1.4588 11.253906 2 C 10.720406 2.5202 10.5 2.9177 10.5 4 L 1.1992188 4 L 2.59375 8.8144531 C 2.59725 8.8217531 2.6036219 8.8287375 2.6074219 8.8359375 C 2.8418219 9.4932375 3.4545469 9.9666406 4.1855469 9.9941406 C 4.1885469 9.9954406 4.1992187 10 4.1992188 10 L 10.699219 10 L 10.699219 10.199219 C 10.699219 10.199219 10.7 10.500391 10.5 10.900391 C 10.3 11.300391 10.200391 11.5 9.4003906 11.5 L 2.9003906 11.5 C 1.9003906 11.5 1.9003906 13 2.9003906 13 L 4.0996094 13 L 4.1992188 13 L 9.0996094 13 L 9.1992188 13 L 9.3007812 13 C 10.500781 13 11.399219 12.299609 11.699219 11.599609 C 11.999219 10.899609 12 10.300781 12 10.300781 L 12 10 L 12 4 C 12 3.4764 12.228619 3 12.699219 3 L 13.25 3 C 13.6642 3 14 2.6642 14 2.25 C 14 1.8358 13.6642 1.5 13.25 1.5 L 13.199219 1.5 z M 9.1992188 13 C 8.5992188 13 8.1992188 13.4 8.1992188 14 C 8.1992188 14.6 8.5992187 15 9.1992188 15 C 9.7992187 15 10.199219 14.6 10.199219 14 C 10.199219 13.4 9.7992188 13 9.1992188 13 z M 4.1992188 13 C 3.5992188 13 3.1992188 13.4 3.1992188 14 C 3.1992188 14.6 3.5992187 15 4.1992188 15 C 4.7992188 15 5.1992188 14.6 5.1992188 14 C 5.1992188 13.4 4.7992187 13 4.1992188 13 z',
    'hospital': 'M7,1C6.4,1,6,1.4,6,2v4H2C1.4,6,1,6.4,1,7v1 c0,0.6,0.4,1,1,1h4v4c0,0.6,0.4,1,1,1h1c0.6,0,1-0.4,1-1V9h4c0.6,0,1-0.4,1-1V7c0-0.6-0.4-1-1-1H9V2c0-0.6-0.4-1-1-1H7z',
    'ice-cream': 'M5.44,8.17a3.473,3.473,0,0,0,2-.63A3.5,3.5,0,0,0,9,8.14h.44L8,13.7a.5.5,0,0,1-.92,0Zm6-3.473a2,2,0,0,1-4,0h0a2,2,0,1,1-2-2h.12a2,2,0,1,1,3.75,0h.13A2,2,0,0,1,11.439,4.7Z',
    'lodging': 'M0.5,2.5C0.2,2.5,0,2.7,0,3v7.5v2C0,12.8,0.2,13,0.5,13S1,12.8,1,12.5V11h13v1.5 c0,0.3,0.2,0.5,0.5,0.5s0.5-0.2,0.5-0.5v-2c0-0.3-0.2-0.5-0.5-0.5H1V3C1,2.7,0.8,2.5,0.5,2.5z M3.5,3C2.7,3,2,3.7,2,4.5l0,0 C2,5.3,2.7,6,3.5,6l0,0C4.3,6,5,5.3,5,4.5l0,0C5,3.7,4.3,3,3.5,3L3.5,3z M7,4C5.5,4,5.5,5.5,5.5,5.5V7h-3C2.2,7,2,7.2,2,7.5v1 C2,8.8,2.2,9,2.5,9H6h9V6.5C15,4,12.5,4,12.5,4H7z',
    'marker': 'M7.5 1C5.42312 1 3 2.2883 3 5.56759C3 7.79276 6.46156 12.7117 7.5 14C8.42309 12.7117 12 7.90993 12 5.56759C12 2.2883 9.57688 1 7.5 1Z',
    'museum': 'M7.5,0L1,3.5V4h13V3.5L7.5,0z M2,5v5l-1,1.6V13h13v-1.4L13,10V5H2z M4,6h1v5.5H4V6z M7,6h1v5.5H7V6z M10,6h1 v5.5h-1V6z',
    'park': 'M14,5.75c0.0113-0.6863-0.3798-1.3159-1-1.61C12.9475,3.4906,12.4014,2.9926,11.75,3 c-0.0988,0.0079-0.1962,0.0281-0.29,0.06c-0.0607-0.66-0.6449-1.1458-1.3048-1.0851C9.8965,1.9987,9.6526,2.1058,9.46,2.28l0,0 c0-0.6904-0.5596-1.25-1.25-1.25S6.96,1.5896,6.96,2.28C6.96,2.28,7,2.3,7,2.33C6.4886,1.8913,5.7184,1.9503,5.2797,2.4618 C5.1316,2.6345,5.0347,2.8451,5,3.07C4.8417,3.0195,4.6761,2.9959,4.51,3C3.6816,2.9931,3.0044,3.659,2.9975,4.4874 C2.9958,4.6872,3.0341,4.8852,3.11,5.07C2.3175,5.2915,1.8546,6.1136,2.0761,6.9061C2.2163,7.4078,2.6083,7.7998,3.11,7.94 c0.2533,0.7829,1.0934,1.2123,1.8763,0.959C5.5216,8.7258,5.9137,8.2659,6,7.71C6.183,7.8691,6.4093,7.9701,6.65,8v5L5,14h5l-1.6-1 v-2c0.7381-0.8915,1.6915-1.5799,2.77-2c0.8012,0.1879,1.603-0.3092,1.7909-1.1103C12.9893,7.7686,13.0025,7.6444,13,7.52 c0.0029-0.0533,0.0029-0.1067,0-0.16C13.6202,7.0659,14.0113,6.4363,14,5.75z M8.4,10.26V6.82C8.6703,7.3007,9.1785,7.5987,9.73,7.6 h0.28c0.0156,0.4391,0.2242,0.849,0.57,1.12C9.7643,9.094,9.0251,9.6162,8.4,10.26z',
    'parking': 'M4 2V13H6V9H8.5C10.433 9 12 7.433 12 5.5C12 3.567 10.433 2 8.5 2H4ZM6 7V4H8.5C9.32843 4 10 4.67157 10 5.5C10 6.32843 9.32843 7 8.5 7H6Z',
    'pharmacy': 'M9.5,4l1.07-1.54c0.0599,0.0046,0.1201,0.0046,0.18,0c0.6904-0.0004,1.2497-0.5603,1.2494-1.2506 C11.999,0.519,11.4391-0.0404,10.7487-0.04C10.0584-0.0396,9.499,0.5203,9.4994,1.2106c0,0.0131,0.0002,0.0262,0.0006,0.0394 c0,0,0,0.07,0,0.1L7,4H9.5z M12,6V5H3v1l1.5,3.5L3,13v1h9v-1l-1-3.5L12,6z M10,10H8v2H7v-2H5V9h2V7h1v2h2V10z',
    'restaurant-pizza': 'M1.393 7.931.025 7.315A14.05 14.05 0 0 1 7.764-.001l.027.07.511 1.331-.003.001a12.613 12.613 0 0 0-6.906 6.53Zm10.963 4.96L2.42 8.414a11.604 11.604 0 0 1 6.354-6.009l.003-.001.817 2.122c-.028-.002-.052-.016-.081-.016a1.062 1.062 0 1 0 .764 1.793l2.413 6.273a.249.249 0 0 1-.334.316ZM7.426 7.52a.925.925 0 1 0-1.849 0 .925.925 0 0 0 1.849 0Zm3.017 2.03a.925.925 0 1 0-.07.353.924.924 0 0 0 .07-.354Z',
    'restaurant': 'M3.5,0l-1,5.5c-0.1464,0.805,1.7815,1.181,1.75,2L4,14c-0.0384,0.9993,1,1,1,1s1.0384-0.0007,1-1L5.75,7.5 c-0.0314-0.8176,1.7334-1.1808,1.75-2L6.5,0H6l0.25,4L5.5,4.5L5.25,0h-0.5L4.5,4.5L3.75,4L4,0H3.5z M12,0 c-0.7364,0-1.9642,0.6549-2.4551,1.6367C9.1358,2.3731,9,4.0182,9,5v2.5c0,0.8182,1.0909,1,1.5,1L10,14c-0.0905,0.9959,1,1,1,1 s1,0,1-1V0z',
    'shop': 'm13.33 5h-1.83l-.39-2.33c-.1601-.7182-.7017-1.2905-1.41-1.49-.3493-.1124-.7131-.173-1.08-.18h-2.24c-.3669.007-.7307.0676-1.08.18-.7083.1995-1.2499.7718-1.41 1.49l-.39 2.33h-1.83c-.2761-.0017-.5013.2208-.503.497-.0003.0519.0074.1035.023.153l1.88 6.3c.1964.6246.7753 1.0496 1.43 1.05h6c.651-.0047 1.2247-.4289 1.42-1.05l1.88-6.3c.0829-.2634-.0635-.5441-.3269-.627-.0463-.0146-.0945-.0223-.1431-.023zm-8.81 0 .36-2.17c.0807-.3625.3736-.6395.74-.7.2463-.0776.5019-.1213.76-.13h2.24c.2614.0078.5205.0515.77.13.3664.0605.6593.3375.74.7l.35 2.17h-6z',
    'theatre': 'M2,1c0,0-1,0-1,1v5.1582C1,8.8885,1.354,11,4.5,11H5V8L2.5,9c0,0,0-2.5,2.5-2.5V5 c0-0.7078,0.0868-1.3209,0.5-1.7754C5.8815,2.805,6.5046,1.9674,8.1562,2.7539L9,3.3027V2c0,0,0-1-1-1C7.2922,1,6.0224,2,5,2 S2.7865,1,2,1z M3,3c0.5523,0,1,0.4477,1,1S3.5523,5,3,5S2,4.5523,2,4S2.4477,3,3,3z M7,4c0,0-1,0-1,1v5c0,2,1,4,4,4s4-2,4-4V5 c0-1-1-1-1-1c-0.7078,0-1.9776,1-3,1S7.7865,4,7,4z M8,6c0.5523,0,1,0.4477,1,1S8.5523,8,8,8S7,7.5523,7,7S7.4477,6,8,6z M12,6 c0.5523,0,1,0.4477,1,1s-0.4477,1-1,1s-1-0.4477-1-1S11.4477,6,12,6z M7.5,10H10h2.5c0,0,0,2.5-2.5,2.5S7.5,10,7.5,10z'
  };
  // Category words (Search Box poi_category, or a caller's category) to
  // Maki names, checked in order, so "pizza restaurant" is a pizza.
  var CATEGORY_ICONS = [
    ['pizza', 'restaurant-pizza'], ['coffee', 'cafe'], ['cafe', 'cafe'],
    ['café', 'cafe'], ['bakery', 'bakery'], ['ice cream', 'ice-cream'],
    ['brewery', 'beer'], ['beer', 'beer'], ['pub', 'beer'],
    ['bar', 'bar'], ['nightclub', 'bar'], ['wine', 'bar'],
    ['fast food', 'fast-food'], ['burger', 'fast-food'],
    ['restaurant', 'restaurant'], ['food', 'restaurant'], ['diner', 'restaurant'],
    ['hotel', 'lodging'], ['motel', 'lodging'], ['hostel', 'lodging'], ['lodging', 'lodging'],
    ['grocery', 'grocery'], ['supermarket', 'grocery'], ['convenience', 'convenience'],
    ['gas', 'fuel'], ['fuel', 'fuel'], ['parking', 'parking'],
    ['hospital', 'hospital'], ['clinic', 'hospital'], ['pharmacy', 'pharmacy'],
    ['park', 'park'], ['garden', 'park'], ['museum', 'museum'], ['gallery', 'museum'],
    ['theater', 'theatre'], ['theatre', 'theatre'], ['cinema', 'cinema'], ['movie', 'cinema'],
    ['bank', 'bank'], ['atm', 'bank'],
    ['shop', 'shop'], ['store', 'shop'], ['boutique', 'shop'],
    ['attraction', 'attraction'], ['landmark', 'attraction']
  ];

  // The Maki name for a marker or card: its own maki when we have that
  // icon, else one matched from its category, else the plain marker.
  function placeIcon(maki, category) {
    if (typeof maki === 'string' && MAKI.hasOwnProperty(maki)) return maki;
    if (typeof category === 'string') {
      var words = ' ' + category.toLowerCase().split(/[^a-zà-ÿ]+/).join(' ') + ' ';
      for (var i = 0; i < CATEGORY_ICONS.length; i++) {
        if (words.indexOf(' ' + CATEGORY_ICONS[i][0] + ' ') !== -1) return CATEGORY_ICONS[i][1];
      }
    }
    return 'marker';
  }
  window.__placeIcon = placeIcon;

  // Only ever called with a key of MAKI, so the markup is all ours.
  function iconSvg(name) {
    var d = MAKI[MAKI.hasOwnProperty(name) ? name : 'marker'];
    return '<svg viewBox="0 0 15 15" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
  }

  function buildPlaceElement(icon, color) {
    var el = document.createElement('div');
    el.className = 'marker-badge place';
    // A caller's color (gray for "other results", say) tints the icon.
    if (color) el.style.color = color;
    el.innerHTML = iconSvg(icon);
    return el;
  }

  // Dark or white, whichever reads better on the badge color (WCAG
  // contrast), so numbers stay legible on orange, green or gray pins.
  var BADGE_DARK_TEXT = '#1a0f04';
  function badgeTextColor(color) {
    var hex = typeof color === 'string' ? color.replace('#', '') : '';
    if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}/i.test(hex)) return '#fff';
    var lum = [0, 2, 4].map(function(i) {
      var c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    var l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    // Against white (L=1) vs. against the dark text (L about 0.0055).
    return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0555) ? '#fff' : BADGE_DARK_TEXT;
  }
  window.__badgeTextColor = badgeTextColor;

  function buildBadgeElement(label, color) {
    var el = document.createElement('div');
    el.className = 'marker-badge';
    el.style.background = color;
    el.style.color = badgeTextColor(color);
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
    if (layer.slot) def.slot = layer.slot;
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
    if (style === 'place') {
      marker = new mapboxgl.Marker({ element: buildPlaceElement(placeIcon(m.maki, m.category), m.color) });
    } else if (style === 'numbered' || style === 'start' || style === 'end') {
      var label = m.label || (style === 'start' ? 'S' : style === 'end' ? 'E' : '');
      marker = new mapboxgl.Marker({ element: buildBadgeElement(label, color) });
    } else {
      marker = new mapboxgl.Marker({ color: color });
    }
    marker.setLngLat(m.coordinates);
    // A place with an id gets a carousel card instead of a popup: clicking
    // its pin selects the card (see selectPlace).
    if (m.popup && !m.id) marker.setPopup(new mapboxgl.Popup().setText(m.popup));
    marker.addTo(map);
    trackedMarkers.push(marker);
    // Tagged by buildSearchMiniPayload with the result's mapbox_id so the
    // carousel and Place Details enrichment can look the marker back up
    // later without walking trackedMarkers.
    if (m.id) {
      var badgeEl = typeof marker.getElement === 'function' ? marker.getElement() : null;
      markersById[m.id] = { marker: marker, el: badgeEl, color: color };
      if (badgeEl && m.name) {
        var nameEl = document.createElement('span');
        nameEl.className = 'marker-name';
        nameEl.textContent = m.name;
        badgeEl.appendChild(nameEl);
      }
      if (badgeEl && typeof badgeEl.addEventListener === 'function') {
        var placeId = m.id;
        badgeEl.addEventListener('click', function(e) {
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          selectPlace(placeId, { scrollCard: true, panTo: true });
        });
      }
    }
    bbox.extend(m.coordinates);
  }

  // Guarantees a marker that opts into the carousel (has .id) also gets
  // a visible number on the map matching its card, unless the caller
  // already gave it an explicit label. Without this, a caller that builds
  // plain unlabeled pins for POI markers (observed live: Claude did this
  // for inline markers, leaving the map showing generic blue pins with no
  // way to tell which card is which) breaks the whole point of the
  // numbering. Mutates markers in place, so it must run before
  // addOneMarker draws them.
  //
  // Numbering runs across the whole render, not per call: a render can
  // draw inline markers and then merge in self-fetched search results, and
  // each set arrives numbered from 1. The first set keeps the caller's
  // numbers when they're unique (a visit order, say); a later set, or one
  // with repeated numbers, is renumbered to continue the carousel's count.
  // Letter labels ("A") are kept as they are. A place already in the carousel
  // this render is dropped rather than drawn and listed twice. Returns the
  // markers to draw.
  function applyPanelNumbering(markers) {
    if (!Array.isArray(markers)) return [];
    var seen = {};
    var fresh = markers.filter(function(m) {
      if (!m || !m.id) return true;
      if (panelIds[m.id] || seen[m.id]) return false;
      seen[m.id] = true;
      return true;
    });
    var keep = panelCount === 0;
    var used = {};
    fresh.forEach(function(m) {
      if (!m || !m.id || !isWholeNumber(m.label)) return;
      if (used[m.label]) keep = false;
      used[m.label] = true;
    });
    if (keep) {
      Object.keys(used).forEach(function(n) {
        panelCount = Math.max(panelCount, parseInt(n, 10));
      });
    }
    fresh.forEach(function(m) {
      if (!m || !m.id) return;
      if (m.label && (keep || !isWholeNumber(m.label))) return;
      // A place with no number of its own gets an icon pin, not a number:
      // the selected pin and card light up together, which is enough to
      // tell them apart.
      if (!m.label && m.style !== 'start' && m.style !== 'end') {
        m.style = 'place';
        return;
      }
      // Otherwise a numbered pin, or a start/end pin, takes the next number.
      panelCount += 1;
      var n = String(panelCount);
      if (m.label && typeof m.popup === 'string' && m.popup.indexOf(m.label + '. ') === 0) {
        // Search popups start with the old number ("3. Name").
        m.popup = n + '. ' + m.popup.slice(String(m.label).length + 2);
      }
      m.label = n;
    });
    return fresh;
  }

  function isWholeNumber(label) {
    if (label === undefined || label === null || label === '') return false;
    var n = parseInt(label, 10);
    return n > 0 && String(n) === String(label);
  }

  // The summary chip covers GL JS's top-left control corner, so move the
  // zoom and layer buttons below it while it's shown.
  function placeTopLeftControls() {
    if (!map || typeof map.getContainer !== 'function') return;
    var container = map.getContainer();
    var corner = container && typeof container.querySelector === 'function'
      ? container.querySelector('.mapboxgl-ctrl-top-left')
      : null;
    if (!corner) return;
    corner.style.top = summaryEl.style.display === 'block'
      ? (summaryEl.offsetHeight + 8) + 'px'
      : '';
  }

  // Bottom padding that keeps fitted data out from under the carousel and
  // the legend above it, unless the map is too short to spare the room.
  function bottomPadding() {
    var bottom = 0;
    if (carouselEl.style.display === 'block') bottom = carouselTop() + 12;
    if (legendEl.style.display === 'block') {
      bottom = Math.max(bottom, legendTop() + 12);
    }
    var el = document.getElementById('map');
    var height = (el && el.clientHeight) || window.innerHeight || 0;
    if (bottom <= 50 || (height && height - bottom - 70 < 120)) return 50;
    return bottom;
  }

  // Distance from the bottom of the map to the top of the carousel. 36px
  // keeps it clear of the Mapbox logo and attribution.
  var CAROUSEL_BOTTOM = 36;
  function carouselTop() {
    return CAROUSEL_BOTTOM + (carouselEl.offsetHeight || 100);
  }

  function legendTop() {
    var bottom = parseInt(legendEl.style.bottom, 10) || 12;
    return bottom + (legendEl.offsetHeight || 0);
  }

  function mapContainerWidth() {
    var el = document.getElementById('map');
    return (el && el.clientWidth) || window.innerWidth || 0;
  }

  var lastFitBounds = null;
  function fitToBounds(bounds) {
    lastFitBounds = bounds;
    setTimeout(function() {
      map.resize();
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: bottomPadding(), left: 30, right: 30 },
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
    var markers = applyPanelNumbering(payload.markers);
    markers.forEach(function(m) { addOneMarker(m, bbox); });
    if (payload.summary && summaryEl.style.display === 'none') {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
      placeTopLeftControls();
    }
    maybeShowSidePanel(markers);
    var bounds = bbox.bounds();
    if (bounds) fitToBounds(bounds);
  }

  function applyBaseMapConfig(baseMapConfig) {
    if (!baseMapConfig || typeof baseMapConfig !== 'object') return;
    if (typeof map.setConfigProperty !== 'function') return;
    Object.keys(baseMapConfig).forEach(function(key) {
      try { map.setConfigProperty('basemap', key, baseMapConfig[key]); } catch (_) { /* not a Standard-based style */ }
    });
  }

  function render(payload) {
    if (!map) return;
    // baseStyle is only otherwise applied at map-construction time (see
    // initMap()) -- MapAppUIResource never seeds initial-data server-side,
    // so every real render_map_tool call arrives here instead. Without this
    // check, a later call passing baseStyle: "standard-satellite" would be
    // silently ignored and the map would stay on whatever style it was
    // constructed with (always "standard" in practice).
    var desiredBaseStyleId = payload.baseStyle === 'standard-satellite'
      ? 'standard-satellite'
      : (payload.baseStyle === 'standard' ? 'standard' : null);
    if (desiredBaseStyleId && desiredBaseStyleId !== currentBaseStyleId) {
      currentBaseStyleId = desiredBaseStyleId;
      map.setStyle('mapbox://styles/mapbox/' + desiredBaseStyleId);
      map.once('style.load', function() { renderBody(payload); });
      return;
    }
    renderBody(payload);
  }

  function renderBody(payload) {
    teardown();
    applyBaseMapConfig(payload.baseMapConfig);

    var bbox = bboxAccumulator();
    var layers = Array.isArray(payload.layers) ? payload.layers : [];
    layers.forEach(function(layer) { addOneLayer(layer, bbox); });
    var markers = applyPanelNumbering(payload.markers);
    markers.forEach(function(m) { addOneMarker(m, bbox); });
    // Covers both inline markers (a caller-composed payload) and self-fetch
    // markers (merged in later via mergeAdditionalPayload) — see
    // maybeShowSidePanel below. Whichever path produced id-bearing POI
    // markers gets the same results carousel.
    maybeShowSidePanel(markers);

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
    if (params.selectedRouteIndex !== undefined && params.selectedRouteIndex !== null) {
      if (typeof params.selectedRouteIndex !== 'number') return false;
      if (!isFinite(params.selectedRouteIndex) || params.selectedRouteIndex < 0) return false;
      if (Math.floor(params.selectedRouteIndex) !== params.selectedRouteIndex) return false;
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
        var routes = (data && data.routes) || [];
        // If elicitation resolved to a specific route server-side, draw that
        // same one out of the freshly re-fetched alternatives — falling back
        // to the first route if the index is out of range (e.g. the API
        // returned fewer alternatives this time around), same fallback
        // philosophy as selectedMapboxId in the search self-fetch.
        var route =
          (typeof params.selectedRouteIndex === 'number' &&
            routes[params.selectedRouteIndex]) ||
          routes[0];
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
    // The Isochrone API requires one of these; a scalar (e.g. 15 instead
    // of [15]) would be silently dropped by buildIsochroneApiUrl.
    var hasMinutes = Array.isArray(params.contours_minutes) && params.contours_minutes.length > 0;
    var hasMeters = Array.isArray(params.contours_meters) && params.contours_meters.length > 0;
    if (!hasMinutes && !hasMeters) return false;
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
      var popupParts = [props.name || 'Result'];
      var addr = props.full_address || props.place_formatted;
      if (addr) popupParts.push(addr);
      if (typeof props.distance === 'number') {
        popupParts.push(Math.round(props.distance) + ' m');
      }
      var coords = f.geometry.coordinates;
      // id/name/category/distanceMeters are the same generic POI fields an
      // inline (hand-composed) marker can carry — see maybeShowSidePanel,
      // which builds the results carousel from either source identically.
      // mapbox_id is missing on the rare result that lacks one; the carousel
      // just skips that row rather than show an unclickable/unenrichable
      // entry.
      markers.push({
        id: props.mapbox_id,
        coordinates: coords,
        style: 'place',
        maki: props.maki,
        popup: popupParts.join(' — '),
        name: props.name || ('Result ' + (i + 1)),
        category: Array.isArray(props.poi_category) ? props.poi_category[0] : undefined,
        distanceMeters: typeof props.distance === 'number' ? props.distance : undefined
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
          'circle-color': '#0f172a',
          'circle-opacity': 0.1,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#0f172a',
          'circle-stroke-opacity': 0.25
        }
      }
    ] : [];

    return { summary: summary, layers: layers, markers: markers };
  }

  // --- Results carousel: one card per place + Place Details enrichment ---
  // Triggered generically by maybeShowSidePanel for ANY marker set that
  // includes id-bearing entries — self-fetch search/category-search
  // results (via mergeAdditionalPayload) and hand-composed inline markers
  // from render_map_tool's own "markers" input (via renderBody) both funnel
  // through the same path. Renders the initial (Search Box-only, or
  // whatever the caller already provided) cards immediately so the
  // carousel never blocks on the slower enrichment call.
  function derivePanelItems(markers) {
    if (!Array.isArray(markers)) return [];
    var items = [];
    markers.forEach(function(m) {
      if (!m || !m.id) return;
      // The pin's own label, so a card reads the same as its pin ("A" too).
      // A place pin has none, and neither does its card.
      var badge = isWholeNumber(m.label) ? parseInt(m.label, 10)
        : (m.label ? String(m.label) : null);
      items.push({
        id: m.id,
        number: badge,
        icon: placeIcon(m.maki, m.category),
        name: m.name || ('Result ' + (items.length + 1)),
        category: m.category,
        distanceMeters: typeof m.distanceMeters === 'number' ? m.distanceMeters : undefined,
        color: m.color
      });
    });
    return items;
  }
  // Exposed so tests can exercise the pure derivation logic without a DOM.
  window.__derivePanelItems = derivePanelItems;

  // Adds cards for places not yet in this render's carousel and enriches
  // just those. A response is applied only if no newer render has started
  // since (panelGeneration), so a slow lookup can't write into newer cards.
  function maybeShowSidePanel(markers) {
    var items = derivePanelItems(markers).filter(function(it) {
      return !panelIds[it.id];
    });
    if (items.length === 0) return;
    items.forEach(function(it) { panelIds[it.id] = true; });
    appendCards(items);
    var generation = panelGeneration;
    fetchPlaceDetailsBatch(
      items.map(function(it) { return it.id; }),
      TOKEN,
      API_ENDPOINT
    ).then(function(result) {
      if (generation === panelGeneration) enrichSidePanel(result);
    });
  }

  // Keyed by mapbox_id -> { li, meta, body } elements, so enrichSidePanel
  // can update a card directly once Place Details resolves, without
  // re-parsing markup back into a queryable DOM (innerHTML + querySelector
  // round-trips don't work in every MCP Apps host's iframe sandbox, and
  // building real nodes up front is simpler to reason about either way).
  // Reset by clearPanel, same lifecycle as the carousel itself.
  var panelRowsById = {};
  // Bumped by teardown(), so responses from an earlier render are dropped.
  var panelGeneration = 0;
  // Id-bearing markers numbered so far this render, and the ids listed.
  var panelCount = 0;
  var panelIds = {};
  var cardListEl = null;
  var cardOrder = [];
  var activePlaceId = null;

  // classList when there is one: GL JS adds its own classes to a marker's
  // element, which assigning className would wipe out.
  function setActiveClass(el, on) {
    if (!el) return;
    if (el.classList && typeof el.classList.toggle === 'function') {
      el.classList.toggle('active', on);
      return;
    }
    var names = String(el.className || '').split(' ').filter(function(c) {
      return c && c !== 'active';
    });
    if (on) names.push('active');
    el.className = names.join(' ');
  }

  // Highlights one place: its card gets a border and its pin inverts and
  // shows the name. scrollCard brings the card into view (a pin was
  // clicked); panTo moves the map when the pin is hidden (a card was
  // picked).
  function selectPlace(id, opts) {
    var row = panelRowsById[id];
    if (!row) return;
    opts = opts || {};
    if (activePlaceId !== id) {
      if (activePlaceId) {
        var prevRow = panelRowsById[activePlaceId];
        var prevPin = markersById[activePlaceId];
        if (prevRow) setActiveClass(prevRow.li, false);
        if (prevPin && prevPin.el) {
          setActiveClass(prevPin.el, false);
          prevPin.el.style.zIndex = '';
        }
      }
      activePlaceId = id;
      setActiveClass(row.li, true);
      var pin = markersById[id];
      if (pin && pin.el) {
        setActiveClass(pin.el, true);
        pin.el.style.zIndex = '2';
      }
    }
    if (opts.scrollCard && typeof row.li.scrollIntoView === 'function') {
      row.li.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    if (opts.panTo) panToIfHidden(id);
  }
  window.__selectPlace = selectPlace;

  // Moves the map only when the pin, or the name label under it, is off
  // screen or under the carousel, so swiping through nearby results
  // doesn't keep shifting it.
  var PIN_LABEL_ROOM = 52;
  function panToIfHidden(id) {
    var entry = markersById[id];
    if (!entry || !map || typeof map.project !== 'function') return;
    var lngLat = entry.marker.getLngLat();
    var p = map.project(lngLat);
    var el = document.getElementById('map');
    var width = (el && el.clientWidth) || 0;
    var height = (el && el.clientHeight) || 0;
    if (!width || !height) return;
    var visibleBottom = height - carouselTop() - PIN_LABEL_ROOM;
    if (p.x >= 24 && p.x <= width - 24 && p.y >= 24 && p.y <= visibleBottom) return;
    // Just far enough to bring it 24px inside the visible area, so the
    // pins around it mostly stay in view.
    var x = Math.min(Math.max(p.x, 48), width - 48);
    var y = Math.min(Math.max(p.y, 48), Math.max(48, visibleBottom - 24));
    map.panBy([p.x - x, p.y - y], { duration: 500 });
  }

  function buildCard(it) {
    var li = document.createElement('li');
    li.className = 'card';

    var badge = null;
    if (it.number !== null && it.number !== undefined) {
      badge = document.createElement('span');
      badge.className = 'card-badge';
      badge.textContent = String(it.number);
    }
    // Match the pin when the caller colored it (e.g. gray for "other
    // results" next to a legend); the default orange is in the CSS.
    if (badge && typeof it.color === 'string' && it.color.toLowerCase() !== '#f97316' &&
        (/^#[0-9a-f]{3,8}$/i).test(it.color)) {
      badge.style.background = it.color;
      badge.style.color = badgeTextColor(it.color);
    }

    var name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = it.name;

    var metaParts = [];
    if (it.category) metaParts.push(it.category);
    if (typeof it.distanceMeters === 'number') {
      metaParts.push(Math.round(it.distanceMeters) + ' m');
    }
    var meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.textContent = metaParts.join(' · ');

    var body = document.createElement('div');
    body.className = 'card-body';
    body.appendChild(name);
    body.appendChild(meta);
    // Placeholder picture, replaced by the photo if one loads (see
    // loadPanelPhoto). Shown first by CSS order.
    var thumb = document.createElement('span');
    thumb.className = 'card-thumb empty';
    thumb.innerHTML = iconSvg(it.icon);
    if (typeof thumb.setAttribute === 'function') {
      thumb.setAttribute('role', 'img');
      thumb.setAttribute('aria-label', it.name);
    }
    if (badge) li.appendChild(badge);
    li.appendChild(body);
    li.appendChild(thumb);

    li.addEventListener('click', function() {
      selectPlace(it.id, { scrollCard: true, panTo: true });
    });

    panelRowsById[it.id] = { li: li, meta: meta, body: body, thumb: thumb };
    return li;
  }

  function clearPanel() {
    while (carouselEl.firstChild) carouselEl.removeChild(carouselEl.firstChild);
    panelRowsById = {};
    cardListEl = null;
    cardOrder = [];
    activePlaceId = null;
  }

  // Swiping selects whichever card ends up in the middle.
  var scrollTimer = null;
  function onCardScroll() {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      scrollTimer = null;
      if (!cardListEl) return;
      var center = (cardListEl.scrollLeft || 0) + (cardListEl.clientWidth || 0) / 2;
      var best = null;
      var bestDist = Infinity;
      cardOrder.forEach(function(id) {
        var row = panelRowsById[id];
        if (!row) return;
        var mid = (row.li.offsetLeft || 0) + (row.li.offsetWidth || 0) / 2;
        var d = Math.abs(mid - center);
        if (d < bestDist) { bestDist = d; best = id; }
      });
      if (best && best !== activePlaceId) selectPlace(best, { panTo: true });
    }, 120);
  }

  // Creates the carousel on the render's first id-bearing markers, and adds
  // cards for later ones (e.g. search results merged in after inline
  // markers), so every numbered pin has a card. The first card starts
  // selected.
  function appendCards(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    var created = false;
    if (!cardListEl) {
      cardListEl = document.createElement('ul');
      cardListEl.className = 'card-list';
      cardListEl.addEventListener('scroll', onCardScroll);
      carouselEl.appendChild(cardListEl);
      carouselEl.style.display = 'block';
      created = true;
    }
    var list = cardListEl;
    items.forEach(function(it) {
      list.appendChild(buildCard(it));
      cardOrder.push(it.id);
    });
    // The legend (bottom-left) moves up above the cards.
    legendEl.style.bottom = (carouselTop() + 8) + 'px';
    if (created) selectPlace(items[0].id);
  }

  // Today's hours from a Places API opening_hours string, which uses OSM
  // syntax: "Mo-Fr 07:00-19:00; Sa,Su 08:00-17:00", "Mo 09:00-12:00,13:00-17:00",
  // "Su off", "24/7". Returns null for anything else (holidays, months, week
  // numbers), so a card shows no hours rather than wrong ones. "Today" is
  // the viewer's day, which can differ from the place's near midnight when
  // they're in different time zones.
  var OSM_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  var HOURS_RANGE = /^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$/;
  function osmDaysInclude(days, day) {
    var parts = days.split(',');
    var hit = false;
    for (var i = 0; i < parts.length; i++) {
      var ends = parts[i].split('-');
      var a = OSM_WEEK.indexOf(ends[0]);
      var b = ends.length === 2 ? OSM_WEEK.indexOf(ends[1]) : a;
      if (a === -1 || b === -1 || ends.length > 2) return null;
      var d = OSM_WEEK.indexOf(day);
      if (a <= b ? (d >= a && d <= b) : (d >= a || d <= b)) hit = true;
    }
    return hit;
  }
  function hoursToday(spec, now) {
    if (typeof spec !== 'string') return null;
    var text = spec.trim();
    if (!text) return null;
    if (text === '24/7') return 'Open 24 hours';
    var day = OSM_WEEK[(now.getDay() + 6) % 7];
    var result = null;
    var rules = text.split(';');
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i].trim();
      if (!rule) continue;
      var space = rule.indexOf(' ');
      if (space === -1) return null;
      var applies = osmDaysInclude(rule.slice(0, space), day);
      if (applies === null) return null;
      var times = rule.slice(space + 1).trim();
      var ranges = times === 'off' || times === 'closed' ? [] : times.split(',');
      for (var j = 0; j < ranges.length; j++) {
        if (!HOURS_RANGE.test(ranges[j].trim())) return null;
      }
      // In OSM a later rule for the same day overrides an earlier one.
      if (applies) {
        result = ranges.length === 0
          ? 'Closed today'
          : 'Today ' + ranges.map(function(r) { return r.trim().replace('-', '–'); }).join(', ');
      }
    }
    return result;
  }
  window.__hoursToday = hoursToday;

  // Search Box results mix Mapbox-native POI ids (decode to
  // "urn:mbxpoi:<uuid>") with OSM-sourced ones (decode to
  // "urn:mbxpoi-osm:n<osm-node-id>") — confirmed live against a real
  // category_search_tool-style query near Herndon, VA, where 2 of 10
  // "cafe" results were OSM-sourced. The Places API's batch endpoint
  // rejects the ENTIRE request with a 422 if even one id isn't its native
  // scheme (same 422 PlaceDetailsTool.ts already works around server-side
  // for boundary ids) — so filter client-side before sending, rather than
  // let one incompatible id in a 10-result batch silently zero out
  // enrichment for the other 9. The prefix alone isn't enough: near Union
  // Square, SF, a Starbucks decodes to "urn:mbxpoi:mapbox-n408854", which
  // the endpoint also rejects, so require the UUID form.
  var PLACES_ID = /^urn:mbxpoi:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isPlacesApiCompatibleId(id) {
    if (typeof id !== 'string' || id.length === 0) return false;
    try {
      return PLACES_ID.test(atob(id));
    } catch (e) {
      return false;
    }
  }

  // Places API Details endpoint — batch form. Mirrors the single-record
  // GET src/tools/place-details-tool/PlaceDetailsTool.ts calls server-side,
  // but the carousel needs details for every result at once, so this uses the
  // POST /details/retrieve batch form (up to 100 ids) instead of one
  // request per pin. Docs: https://docs.mapbox.com/api/search/places/
  // Like every other self-fetch call, this runs client-side against the
  // public token — the Places API's docs list no secret scope requirement
  // for this endpoint, same as Search Box/Directions/etc.
  function fetchPlaceDetailsBatch(ids, publicToken, apiEndpoint) {
    var compatibleIds = (Array.isArray(ids) ? ids : []).filter(isPlacesApiCompatibleId);
    if (compatibleIds.length === 0) return Promise.resolve(null);
    var qp = new URLSearchParams();
    qp.append('access_token', publicToken);
    var url = apiEndpoint + 'places/v1/details/retrieve?' + qp.toString();
    var post = function(batch, retried) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch })
      }).then(function(res) {
        // 206 is a partial batch (some ids missing/unprocessed) — still
        // has usable "results", so treat it the same as 200.
        if (res.ok || res.status === 206) return res.json();
        // A 422 names the one id it rejected ("Invalid mapbox_id format:
        // <id>"), in case an id format slips past the filter above. Drop
        // that id and try once more, rather than lose the whole batch.
        if (res.status !== 422 || retried) return null;
        return res.json().then(function(body) {
          var msg = body && typeof body.message === 'string' ? body.message : '';
          var bad = msg.slice(msg.lastIndexOf(' ') + 1).split('=')[0];
          var rest = batch.filter(function(id) { return id.split('=')[0] !== bad; });
          if (!bad || rest.length === batch.length || rest.length === 0) return null;
          return post(rest, true);
        });
      });
    };
    return post(compatibleIds.slice(0, 100), false)
      // Enrichment is a nice-to-have on top of already-rendered cards —
      // Public Preview quota (1,000 records/month) or a transient error
      // here should never surface as a map error, just leave the
      // Search-Box-only cards as they are.
      .catch(function() { return null; });
  }

  // Place Details photos are hosted wherever each business's site hosts
  // them, so the in-chat CSP (mapAppCsp.ts) can't allow them. Inside a host,
  // the page asks the server for the photo (PlacePhotoResource, by mapbox_id)
  // and shows it as a data: URL. A page with no host has no CSP of ours, so
  // it loads the photo URL directly.
  var MAX_PANEL_PHOTOS = 10;
  var EMBEDDED = window.parent !== window;
  var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  var PHOTO_TIMEOUT_MS = 15000;

  function loadPanelPhoto(row, id, photoUrl) {
    var show = function(src) {
      // A later render may have replaced the carousel while this loaded.
      if (panelRowsById[id] !== row) return;
      row.thumb.className = 'card-thumb';
      row.thumb.innerHTML = '';
      row.thumb.style.backgroundImage = 'url("' + src.replace(/"/g, '') + '")';
    };
    if (!EMBEDDED || !hostAnswered) {
      // No MCP host (a standalone or framed page), so no CSP of ours
      // either. Load it first: some sites refuse hotlinked photos (403),
      // which would leave an empty box on the card.
      if (photoUrl.indexOf('https://') !== 0 || typeof Image !== 'function') return;
      var img = new Image();
      img.onload = function() { show(photoUrl); };
      img.src = photoUrl;
      return;
    }
    // Hosts that don't support resources/read (ChatGPT) may never answer.
    sendRequest('resources/read', {
      uri: 'mapbox://place-photo/' + encodeURIComponent(id)
    }, PHOTO_TIMEOUT_MS).then(function(rr) {
      var c = rr && Array.isArray(rr.contents) ? rr.contents[0] : null;
      if (c && typeof c.blob === 'string' &&
          PHOTO_TYPES.indexOf(c.mimeType) !== -1) {
        show('data:' + c.mimeType + ';base64,' + c.blob);
      }
    }, function() {});
  }

  function enrichSidePanel(detailsResult) {
    if (!detailsResult || !Array.isArray(detailsResult.results)) return;
    var photosRequested = 0;
    detailsResult.results.forEach(function(place) {
      if (!place || !place.mapbox_id) return;
      var row = panelRowsById[place.mapbox_id];
      if (!row) return;
      var photoUrl = place.photos && place.photos[0] && place.photos[0].url;
      if (typeof photoUrl === 'string' && photosRequested < MAX_PANEL_PHOTOS) {
        photosRequested++;
        loadPanelPhoto(row, place.mapbox_id, photoUrl);
      }
      if (place.score && typeof place.score.popularity === 'number') {
        var extra = Math.round(place.score.popularity * 100) + '% popularity';
        row.meta.textContent = row.meta.textContent ? row.meta.textContent + ' · ' + extra : extra;
      }
      // Today's hours and the phone number on a second line.
      var lineParts = [];
      var hours = hoursToday(place.opening_hours, new Date());
      if (hours) lineParts.push(hours);
      if (typeof place.phone === 'string' && place.phone) lineParts.push(place.phone);
      if (lineParts.length > 0) {
        var line = document.createElement('div');
        line.className = 'card-extra';
        line.textContent = lineParts.join(' · ');
        row.body.appendChild(line);
      }
    });
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
  // place pins for the POIs. Isochrone contours aren't drawn here either
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
      var parts = [poi.name];
      if (poi.address) parts.push(poi.address);
      if (typeof poi.distance_meters === 'number') {
        parts.push(Math.round(poi.distance_meters) + ' m');
      }
      markers.push({
        id: poi.id,
        coordinates: [poi.longitude, poi.latitude],
        style: 'place',
        popup: parts.join(' — '),
        name: poi.name,
        category: poi.category,
        distanceMeters: typeof poi.distance_meters === 'number' ? poi.distance_meters : undefined
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
          id: props.mapbox_id,
          name: props.name || 'Unknown',
          address: props.full_address || props.place_formatted,
          category: Array.isArray(props.poi_category) ? props.poi_category[0] : undefined,
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
