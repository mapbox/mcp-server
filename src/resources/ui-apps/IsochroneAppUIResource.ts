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
 * Serves the HTML for the Isochrone App MCP App.
 *
 * Receives the isochrone FeatureCollection from `isochrone_app_tool` via the
 * MCP Apps postMessage protocol and renders each contour as a translucent fill
 * (and outline) layer on a live Mapbox GL JS map, with the origin point marked.
 */
export class IsochroneAppUIResource extends BaseResource {
  readonly name = 'Isochrone App UI';
  readonly uri = 'ui://mapbox/isochrone-app/index.html';
  readonly description =
    'Interactive UI for visualizing Mapbox isochrone contours with Mapbox GL JS (MCP Apps)';
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

    const html = renderIsochroneAppHtml({
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

function renderIsochroneAppHtml(params: {
  publicToken: string;
  glVersion: string;
}): string {
  const { publicToken, glVersion } = params;

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

  // ---------------------------------------------------------------------------
  // MCP App postMessage protocol
  // ---------------------------------------------------------------------------
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
    appInfo: { name: 'Isochrone Preview', version: '1.0.0' }
  }).then(function() {
    sendNotification('ui/notifications/initialized', {});
  }, function() {
    sendNotification('ui/notifications/initialized', {});
  });

  // ---------------------------------------------------------------------------
  // Map initialization
  // ---------------------------------------------------------------------------
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
      if (pendingPayload) {
        drawIsochrone(pendingPayload);
        pendingPayload = null;
      }
    });
    map.on('error', function(e) {
      console.error('Mapbox error:', e && e.error && e.error.message ? e.error.message : e);
    });
  }

  initMap();

  // ---------------------------------------------------------------------------
  // Tool result handler — extracts isochrone payload
  // ---------------------------------------------------------------------------
  function handleToolResult(result) {
    var payload = extractPayload(result);
    if (!payload) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Could not find isochrone data in tool result.';
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
      drawIsochrone(payload);
    } else {
      pendingPayload = payload;
    }
  }

  function extractPayload(result) {
    if (result && result.structuredContent && result.structuredContent.isochrone) {
      return result.structuredContent.isochrone;
    }
    if (result && Array.isArray(result.content)) {
      for (var i = 0; i < result.content.length; i++) {
        var c = result.content[i];
        if (c && c.type === 'text' && typeof c.text === 'string') {
          try {
            var parsed = JSON.parse(c.text);
            if (parsed && parsed.featureCollection) {
              return parsed;
            }
            if (parsed && parsed.isochrone && parsed.isochrone.featureCollection) {
              return parsed.isochrone;
            }
          } catch (_) {
            // not JSON, keep looking
          }
        }
      }
    }
    return null;
  }

  function drawIsochrone(payload) {
    var fc = payload.featureCollection;
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Isochrone has no contours.';
      errorEl.style.display = 'block';
      return;
    }

    // Mapbox returns contours largest-first when polygons=true. Reverse so
    // smaller contours render on top of larger ones for a clean layered look.
    var features = fc.features.slice().reverse();

    // Compute bounds across all coordinates so we can fit the camera
    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    function extend(c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }
    function walkCoords(coords) {
      if (typeof coords[0] === 'number') {
        extend(coords);
      } else {
        for (var i = 0; i < coords.length; i++) walkCoords(coords[i]);
      }
    }
    features.forEach(function(f) { if (f.geometry) walkCoords(f.geometry.coordinates); });

    // Clean up any prior layers/sources
    features.forEach(function(_, i) {
      var sid = 'iso-source-' + i;
      var fid = 'iso-fill-' + i;
      var lid = 'iso-line-' + i;
      if (map.getLayer(fid)) map.removeLayer(fid);
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
    });

    features.forEach(function(feature, i) {
      var props = feature.properties || {};
      var color = '#' + (props.color || props.fillColor || '3b82f6').replace(/^#/, '');
      var fillOpacity = typeof props.fillOpacity === 'number' ? props.fillOpacity : 0.25;

      map.addSource('iso-source-' + i, { type: 'geojson', data: feature });
      map.addLayer({
        id: 'iso-fill-' + i,
        type: 'fill',
        source: 'iso-source-' + i,
        paint: { 'fill-color': color, 'fill-opacity': fillOpacity }
      });
      map.addLayer({
        id: 'iso-line-' + i,
        type: 'line',
        source: 'iso-source-' + i,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 }
      });
    });

    if (payload.origin && typeof payload.origin.longitude === 'number') {
      new mapboxgl.Marker({ color: '#0f172a' })
        .setLngLat([payload.origin.longitude, payload.origin.latitude])
        .setPopup(new mapboxgl.Popup().setText('Origin'))
        .addTo(map);
    }

    loadingEl.style.display = 'none';

    if (isFinite(minLng)) {
      requestSizeToFit();
      setTimeout(function() {
        map.resize();
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: { top: 70, bottom: 30, left: 30, right: 30 },
          duration: 600
        });
      }, 60);
    } else {
      requestSizeToFit();
    }
  }
})();
</script>
</body>
</html>`;
}
