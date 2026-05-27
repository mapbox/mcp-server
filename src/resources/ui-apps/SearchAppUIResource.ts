// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ReadResourceResult,
  ServerNotification,
  ServerRequest
} from '@modelcontextprotocol/sdk/types.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { BaseResource } from '../BaseResource.js';
import type { HttpRequest } from '../../utils/types.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';

const MAPBOX_GL_VERSION = '3.12.0';

/**
 * Serves the HTML for the Search Results App MCP App.
 *
 * Receives search results from `search_and_geocode_app_tool` or
 * `category_search_app_tool` and drops numbered pins on the map with popups
 * showing name, address, and category.
 */
export class SearchAppUIResource extends BaseResource {
  readonly name = 'Search Results App UI';
  readonly uri = 'ui://mapbox/search-app/index.html';
  readonly description =
    'Interactive UI for visualizing Mapbox search results with Mapbox GL JS (MCP Apps)';
  readonly mimeType = RESOURCE_MIME_TYPE;

  private readonly httpRequest: HttpRequest;
  private readonly apiEndpoint: () => string;

  constructor(params: {
    httpRequest: HttpRequest;
    apiEndpoint?: () => string;
  }) {
    super();
    this.httpRequest = params.httpRequest;
    this.apiEndpoint =
      params.apiEndpoint ??
      (() => process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/');
  }

  async read(
    _uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    const accessToken =
      (extra?.authInfo?.token as string | undefined) ||
      process.env.MAPBOX_ACCESS_TOKEN ||
      '';

    const publicToken = await resolveMapboxPublicToken({
      accessToken,
      apiEndpoint: this.apiEndpoint(),
      httpRequest: this.httpRequest
    });

    const html = renderSearchAppHtml({
      publicToken: publicToken ?? '',
      glVersion: MAPBOX_GL_VERSION
    });

    return {
      contents: [
        {
          uri: this.uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                connectDomains: [
                  'https://*.mapbox.com',
                  'https://events.mapbox.com'
                ],
                resourceDomains: ['https://api.mapbox.com'],
                workerDomains: ['blob:']
              },
              preferredSize: { width: 1000, height: 600 }
            }
          }
        }
      ]
    };
  }
}

function renderSearchAppHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

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

  var messageId = 0;
  var pendingRequests = new Map();

  function sendRequest(method, params) {
    var id = ++messageId;
    window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
    return new Promise(function(resolve, reject) {
      pendingRequests.set(id, { resolve: resolve, reject: reject });
    });
  }
  function sendNotification(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
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
    appInfo: { name: 'Search Results', version: '1.0.0' }
  }).then(function() {
    sendNotification('ui/notifications/initialized', {});
  }, function() {
    sendNotification('ui/notifications/initialized', {});
  });

  function initMap() {
    if (!TOKEN) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No Mapbox public token available.';
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
      if (pendingPayload) {
        drawResults(pendingPayload);
        pendingPayload = null;
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }
  initMap();

  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (!payload || !Array.isArray(payload.results) || payload.results.length === 0) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'No search results to display.';
      errorEl.style.display = 'block';
      return;
    }

    if (payload.summary) {
      summaryEl.textContent = payload.summary;
      summaryEl.style.display = 'block';
    }

    if (!map) {
      loadingEl.style.display = 'none';
      return;
    }
    if (mapLoaded) {
      drawResults(payload);
    } else {
      pendingPayload = payload;
    }
  }

  function extractPayload(result) {
    if (result && result.structuredContent && result.structuredContent.search) {
      return result.structuredContent.search;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && Array.isArray(parsed.results)) return parsed;
            if (parsed && parsed.search && Array.isArray(parsed.search.results)) {
              return parsed.search;
            }
          } catch (_) { /* not JSON */ }
        }
      }
    }
    return null;
  }

  function drawResults(payload) {
    var results = payload.results;

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

      new mapboxgl.Marker({ element: el })
        .setLngLat(r.location)
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml))
        .addTo(map);
    });

    if (payload.proximity && typeof payload.proximity.longitude === 'number') {
      extend([payload.proximity.longitude, payload.proximity.latitude]);
      var origin = document.createElement('div');
      origin.className = 'proximity-marker';
      new mapboxgl.Marker({ element: origin })
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
</script>
</body>
</html>`;
}
