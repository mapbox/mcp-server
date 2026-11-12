// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MAPBOX_GL_VERSION } from './mapAppHtml.js';
import { MVT_DECODER_JS } from './mvtDecoder.js';

/**
 * HTML for the vector tile viewer (`mvt_preview_tool`), opened by ChatGPT for
 * a `.mvt` or `.pbf` file. The page reads the file through the host
 * (`resources/read` on the opaque URI it is given), decodes it and draws each
 * layer in its own color, placed by the tile address in the file name or one
 * the user enters. Outside a file entrypoint, a file picker does the same.
 * File contents only go in through textContent.
 */
export function renderMvtPreviewHtml(params: {
  publicToken: string;
  glVersion?: string;
}): string {
  const glVersion = params.glVersion ?? MAPBOX_GL_VERSION;
  // Safe inside <script>: no "</script>" can survive the escaping.
  const json = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mapbox Vector Tile Viewer</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1c1f24; --muted: #6b7280; --line: #e3e5e8; --field: #f4f5f6;
    --accent: #3b6cf6; --error: #b42318; --map-bg: #f3f3f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  :root[data-theme="dark"] {
    --bg: #1f2125; --fg: #eceef1; --muted: #9aa1ac; --line: #34383f; --field: #2a2d33;
    --accent: #7d9dff; --error: #ff8a7a; --map-bg: #101216;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { margin: 0; height: 100%; min-height: 500px; color: var(--fg); background: var(--map-bg); font-size: 13px; }
  #map { position: fixed; inset: 0; }
  #panel {
    position: fixed; top: calc(12px + var(--inset-top, 0px)); left: calc(12px + var(--inset-left, 0px));
    width: 300px; max-height: calc(100% - 24px - var(--inset-top, 0px) - var(--inset-bottom, 0px));
    overflow-y: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14); padding: 12px;
  }
  form { display: flex; gap: 6px; align-items: center; }
  input[type="text"] {
    flex: 1; min-width: 0; font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
    color: var(--fg); background: var(--field); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px;
  }
  button { font: inherit; color: inherit; cursor: pointer; }
  .btn { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 6px 10px; font-weight: 600; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); }
  h1 { font-size: 15px; margin: 0 0 2px; overflow-wrap: anywhere; }
  h2 { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: baseline; }
  .meta { color: var(--muted); }
  .error { color: var(--error); margin-top: 8px; }
  .options { display: flex; gap: 14px; margin-top: 10px; }
  label { display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0; }
  .layer { padding: 3px 0; }
  .layer .row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
  .name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fields, .props { margin: 4px 0 6px 24px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 12px; }
  .props { margin-left: 0; }
  .fields .k, .props .k { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .fields .v, .props .v { color: var(--muted); overflow-wrap: anywhere; }
  #picker { margin-top: 10px; }
  @media (max-width: 560px) {
    #panel { top: auto; bottom: calc(8px + var(--inset-bottom, 0px)); left: 8px; right: 8px; width: auto; max-height: 45%; }
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="panel">
  <h1 id="file-name">Vector tile</h1>
  <div class="meta" id="file-meta">Waiting for a .mvt or .pbf file…</div>
  <div id="error" class="error" hidden></div>
  <h2><span>Tile address</span></h2>
  <form id="tile-form">
    <input id="tile-input" type="text" placeholder="z/x/y, for example 14/9326/4739" aria-label="Tile address z/x/y" autocomplete="off" spellcheck="false">
    <button class="btn" type="submit">Place</button>
  </form>
  <div class="meta" id="tile-note"></div>
  <div class="options">
    <label><input type="checkbox" id="opt-outline" checked> Tile outline</label>
    <label><input type="checkbox" id="opt-basemap"> Base map</label>
  </div>
  <div id="layers-section" hidden>
    <h2><span>Layers</span></h2>
    <div id="layers"></div>
  </div>
  <h2><span>Feature</span></h2>
  <div id="feature" class="meta">Click a feature to inspect it.</div>
  <div id="picker"><label class="link"><input type="file" id="file-input" accept=".mvt,.pbf" hidden> Open a file from this computer…</label></div>
</div>

<script>
${MVT_DECODER_JS}
(function() {
  var TOKEN = ${json(params.publicToken)};
  var GL_VERSION = ${json(glVersion)};
  var COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5',
    '#f032e6', '#9a6324', '#808000', '#e6739f', '#2f7ed8', '#c9a400'];
  var MAX_VALUE_LENGTH = 200;
  var GEOMETRY = { 0: 'unknown', 1: 'point', 2: 'line', 3: 'polygon' };

  var fileName = '';
  var fileSize = 0;
  var tile = null;
  var decoded = null;
  var hidden = {};
  var expanded = {};
  var selected = null;
  var map = null;
  var styleReady = false;
  var layerIds = [];
  var popup = null;
  var displayMode = '';
  var loadedUri = '';
  var $ = function(id) { return document.getElementById(id); };
  var root = document.documentElement;

  // --- MCP Apps postMessage protocol ---------------------------------------
  var messageId = 0;
  var pending = new Map();
  function request(method, params, timeoutMs) {
    var id = ++messageId;
    return new Promise(function(resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
      if (timeoutMs) {
        setTimeout(function() {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(method + ' timed out'));
        }, timeoutMs);
      }
    });
  }
  function notify(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      var p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'ui/notifications/tool-input' && msg.params) {
      openHostFile(msg.params.arguments && msg.params.arguments.file, null);
    }
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      var sc = msg.params.structuredContent;
      if (sc && sc.mvtPreview === true) openHostFile(sc.file, sc.tile || null);
    }
    if (msg.method === 'ui/notifications/host-context-changed' && msg.params) applyHostContext(msg.params);
  });

  var hostTheme = false;
  function applyHostContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    if (ctx.theme === 'light' || ctx.theme === 'dark') {
      hostTheme = true;
      root.setAttribute('data-theme', ctx.theme);
    }
    var insets = ctx.safeAreaInsets;
    if (insets) {
      ['top', 'right', 'bottom', 'left'].forEach(function(side) {
        if (typeof insets[side] === 'number') root.style.setProperty('--inset-' + side, insets[side] + 'px');
      });
    }
    if (ctx.displayMode) {
      displayMode = ctx.displayMode;
      if (map) setTimeout(function() { map.resize(); }, 100);
      shareContext();
    }
  }
  var darkQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (darkQuery && darkQuery.matches && !hostTheme) root.setAttribute('data-theme', 'dark');

  var canUpdateModelContext = false;
  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox Vector Tile Viewer', version: '1.0.0' }
  }, 5000).then(function(result) {
    canUpdateModelContext = !!(result && result.hostCapabilities && result.hostCapabilities.updateModelContext);
    applyHostContext(result && result.hostContext);
    notify('ui/notifications/initialized', {});
    if (displayMode === 'inline') notify('ui/notifications/size-changed', { height: 560 });
  }, function() { notify('ui/notifications/initialized', {}); });

  // --- Reading the file --------------------------------------------------------
  function showError(text) {
    $('error').textContent = text || '';
    $('error').hidden = !text;
  }

  function tileFromName(name) {
    var m = /(\\d{1,2})[-_.](\\d+)[-_.](\\d+)\\D*$/.exec(name || '');
    return m ? validTile(+m[1], +m[2], +m[3]) : null;
  }
  function validTile(z, x, y) {
    var size = Math.pow(2, z);
    return z >= 0 && z <= 30 && x >= 0 && y >= 0 && x < size && y < size ? { z: z, x: x, y: y } : null;
  }

  function base64Bytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Tiles served over HTTP are usually gzipped; saved as-is they stay that way.
  function gunzipIfNeeded(bytes) {
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return Promise.resolve(bytes);
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('This file is gzipped and the browser cannot unzip it.'));
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer().then(function(buffer) { return new Uint8Array(buffer); });
  }

  function openHostFile(file, knownTile) {
    if (!file || typeof file.resourceUri !== 'string' || !file.resourceUri) return;
    if (knownTile && file.resourceUri === loadedUri) {
      if (!tile) placeTile(knownTile);
      return;
    }
    if (file.resourceUri === loadedUri) return;
    loadedUri = file.resourceUri;
    fileName = file.name || 'tile.mvt';
    $('file-name').textContent = fileName;
    $('file-meta').textContent = 'Reading the file…';
    showError('');
    request('resources/read', { uri: file.resourceUri, _meta: { 'openai/resource': { representation: 'blob' } } }, 30000)
      .then(function(result) {
        var item = result && Array.isArray(result.contents) ? result.contents[0] : null;
        if (item && typeof item.blob === 'string') return base64Bytes(item.blob);
        if (item && typeof item.text === 'string') {
          // A host that returns text has likely mangled the bytes; try anyway.
          var bytes = new Uint8Array(item.text.length);
          for (var i = 0; i < item.text.length; i++) bytes[i] = item.text.charCodeAt(i) & 0xff;
          return bytes;
        }
        throw new Error('the host returned no file contents');
      })
      .then(function(bytes) { showBytes(bytes, knownTile || tileFromName(fileName)); })
      .catch(function(error) {
        loadedUri = '';
        $('file-meta').textContent = '';
        showError('The file could not be read: ' + error.message);
      });
  }

  $('file-input').addEventListener('change', function() {
    var file = $('file-input').files && $('file-input').files[0];
    if (!file) return;
    loadedUri = '';
    fileName = file.name;
    $('file-name').textContent = fileName;
    showError('');
    file.arrayBuffer().then(function(buffer) {
      showBytes(new Uint8Array(buffer), tileFromName(fileName));
    }, function(error) { showError('The file could not be read: ' + error.message); });
  });

  function showBytes(bytes, address) {
    fileSize = bytes.length;
    gunzipIfNeeded(bytes).then(function(raw) {
      decoded = decodeMvt(raw);
      hidden = {};
      expanded = {};
      selected = null;
      if (popup) popup.remove();
      renderPanel();
      renderFeature();
      placeTile(address);
    }).catch(function(error) {
      decoded = null;
      $('file-meta').textContent = '';
      $('layers-section').hidden = true;
      showError('This is not a vector tile this viewer can read: ' + error.message);
    });
  }

  function placeTile(address) {
    tile = address;
    $('tile-input').value = tile ? tile.z + '/' + tile.x + '/' + tile.y : '';
    $('tile-note').textContent = tile
      ? ''
      : 'No tile address in the file name, so the tile is drawn as 0/0/0: shapes are right, the location is not. Enter z/x/y to place it.';
    showOnMap();
    shareContext();
  }

  $('tile-form').addEventListener('submit', function(event) {
    if (event && event.preventDefault) event.preventDefault();
    var m = /^\\s*(\\d{1,2})\\s*[\\/,\\s]\\s*(\\d+)\\s*[\\/,\\s]\\s*(\\d+)\\s*$/.exec($('tile-input').value || '');
    var address = m ? validTile(+m[1], +m[2], +m[3]) : null;
    if (!address) { showError('Enter the tile address as z/x/y, with x and y below 2^z.'); return; }
    showError('');
    placeTile(address);
  });

  // --- Panel -------------------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function colorOf(index) { return COLORS[index % COLORS.length]; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function layerSummary(layer) {
    var types = {}, fields = {};
    layer.features.forEach(function(f) {
      var t = GEOMETRY[f.type] || 'unknown';
      types[t] = (types[t] || 0) + 1;
      Object.keys(f.properties).forEach(function(k) {
        if (!fields[k]) fields[k] = typeof f.properties[k];
      });
    });
    return { types: types, fields: fields };
  }

  function renderPanel() {
    var features = decoded.layers.reduce(function(n, l) { return n + l.features.length; }, 0);
    var extent = decoded.layers.length ? decoded.layers[0].extent : 4096;
    $('file-meta').textContent = [
      Math.max(1, Math.round(fileSize / 1024)) + ' KB',
      plural(decoded.layers.length, 'layer'),
      plural(features, 'feature'),
      'extent ' + extent
    ].join(' · ');
    $('layers-section').hidden = decoded.layers.length === 0;
    var list = $('layers');
    list.textContent = '';
    decoded.layers.forEach(function(layer, index) {
      var summary = layerSummary(layer);
      var item = el('div', 'layer');
      var row = el('div', 'row');
      var label = el('label');
      var box = el('input');
      box.type = 'checkbox';
      box.checked = !hidden[index];
      box.addEventListener('change', function() {
        hidden[index] = !box.checked;
        applyVisibility();
        shareContext();
      });
      var swatch = el('span', 'swatch');
      swatch.style.background = colorOf(index);
      label.appendChild(box);
      label.appendChild(swatch);
      label.appendChild(el('span', 'name', layer.name || '(unnamed)'));
      row.appendChild(label);
      var toggle = el('button', 'link', String(layer.features.length));
      toggle.type = 'button';
      var details = el('div', 'fields');
      details.hidden = !expanded[index];
      Object.keys(summary.types).forEach(function(t) {
        details.appendChild(el('span', 'k', t));
        details.appendChild(el('span', 'v', plural(summary.types[t], 'feature')));
      });
      Object.keys(summary.fields).forEach(function(k) {
        details.appendChild(el('span', 'k', k));
        details.appendChild(el('span', 'v', summary.fields[k]));
      });
      toggle.addEventListener('click', function() {
        expanded[index] = !expanded[index];
        details.hidden = !expanded[index];
      });
      row.appendChild(toggle);
      item.appendChild(row);
      item.appendChild(details);
      list.appendChild(item);
    });
  }

  function clip(value) {
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) text = String(value);
    return text.length > MAX_VALUE_LENGTH ? text.slice(0, MAX_VALUE_LENGTH) + '…' : text;
  }

  function renderFeature() {
    var box = $('feature');
    box.textContent = '';
    if (!selected) {
      box.className = 'meta';
      box.textContent = 'Click a feature to inspect it.';
      return;
    }
    box.className = 'props';
    var rows = [['layer', selected.layer], ['geometry', selected.geometry]];
    if (selected.id !== undefined) rows.push(['id', selected.id]);
    Object.keys(selected.properties).forEach(function(name) { rows.push([name, selected.properties[name]]); });
    rows.forEach(function(pair) {
      box.appendChild(el('span', 'k', pair[0]));
      box.appendChild(el('span', 'v', clip(pair[1])));
    });
  }

  // --- Map -----------------------------------------------------------------------
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }

  function styleFor(baseMap) {
    if (baseMap && TOKEN) return 'mapbox://styles/mapbox/' + (isDark() ? 'dark-v11' : 'light-v11');
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': isDark() ? '#101216' : '#f3f3f0' } }]
    };
  }

  function loadGl(onReady, onError) {
    if (window.mapboxgl) { onReady(); return; }
    var base = 'https://api.mapbox.com/mapbox-gl-js/v' + GL_VERSION + '/mapbox-gl';
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + '.css';
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.src = base + '.js';
    script.onload = onReady;
    script.onerror = onError;
    document.head.appendChild(script);
  }

  function showOnMap() {
    if (!decoded) return;
    if (!TOKEN) {
      showError('The map needs a public token for this account. The layers and fields are listed above.');
      return;
    }
    if (map) { addTileLayers(true); return; }
    loadGl(function() {
      if (map) return;
      if (TOKEN) mapboxgl.accessToken = TOKEN;
      map = new mapboxgl.Map({
        container: 'map', style: styleFor($('opt-basemap').checked), center: [0, 0], zoom: 1,
        projection: 'mercator', attributionControl: false
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      var first = true;
      // Also fires after every setStyle, which drops the tile layers.
      map.on('style.load', function() {
        // A base map style brings its own globe projection; tiles are square in Mercator.
        if (map.getProjection().name !== 'mercator') map.setProjection('mercator');
        styleReady = true;
        addTileLayers(first);
        first = false;
      });
      map.on('click', onMapClick);
      map.on('moveend', scheduleShareContext);
    }, function() {
      showError('Mapbox GL JS could not be loaded. The layers and fields are listed above.');
    });
  }

  function tileBounds() {
    var t = tile || { z: 0, x: 0, y: 0 };
    var n = Math.pow(2, t.z);
    function lat(y) { var r = Math.PI * (1 - 2 * y / n); return Math.atan((Math.exp(r) - Math.exp(-r)) / 2) * 180 / Math.PI; }
    return [[t.x / n * 360 - 180, lat(t.y + 1)], [(t.x + 1) / n * 360 - 180, lat(t.y)]];
  }

  function removeTileLayers() {
    layerIds.forEach(function(id) { if (map.getLayer(id)) map.removeLayer(id); });
    layerIds = [];
    Object.keys(map.getStyle().sources || {}).forEach(function(id) {
      if (id.indexOf('mvt-') === 0) map.removeSource(id);
    });
  }

  function visibility(index) { return hidden[index] ? 'none' : 'visible'; }

  function addTileLayers(fit) {
    if (!map || !styleReady || !decoded) return;
    removeTileLayers();
    var b = tileBounds();
    map.addSource('mvt-outline', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: [[b[0][0], b[0][1]], [b[1][0], b[0][1]], [b[1][0], b[1][1]], [b[0][0], b[1][1]], [b[0][0], b[0][1]]] } } });
    map.addLayer({ id: 'mvt-outline', type: 'line', source: 'mvt-outline',
      layout: { visibility: $('opt-outline').checked ? 'visible' : 'none' },
      paint: { 'line-color': isDark() ? '#9aa1ac' : '#6b7280', 'line-width': 1, 'line-dasharray': [3, 2] } });
    layerIds.push('mvt-outline');
    decoded.layers.forEach(function(layer, index) {
      var source = 'mvt-' + index;
      var color = colorOf(index);
      var features = mvtLayerToGeoJson(layer, tile).map(function(f) {
        f.properties = Object.assign({}, f.properties, { __layer: layer.name, __id: f.id });
        return f;
      });
      map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
      var layout = { visibility: visibility(index) };
      [
        { suffix: 'fill', type: 'fill', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.18 } },
        { suffix: 'line', type: 'line', filter: ['in', '$type', 'Polygon', 'LineString'], paint: { 'line-color': color, 'line-width': 1 } },
        { suffix: 'circle', type: 'circle', filter: ['==', '$type', 'Point'],
          paint: { 'circle-color': color, 'circle-radius': 3, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.5 } }
      ].forEach(function(spec) {
        var id = 'mvt-' + index + '-' + spec.suffix;
        map.addLayer({ id: id, type: spec.type, source: source, filter: spec.filter, layout: layout, paint: spec.paint });
        layerIds.push(id);
      });
    });
    if (fit) {
      var wide = window.innerWidth > 560;
      map.fitBounds(b, { padding: { top: 40, bottom: 40, right: 40, left: wide ? 340 : 40 }, animate: false });
    }
  }

  function applyVisibility() {
    if (!map || !styleReady || !decoded) return;
    decoded.layers.forEach(function(_, index) {
      ['fill', 'line', 'circle'].forEach(function(suffix) {
        var id = 'mvt-' + index + '-' + suffix;
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility(index));
      });
    });
  }

  function onMapClick(e) {
    var ids = layerIds.filter(function(id) { return id !== 'mvt-outline' && map.getLayer(id); });
    if (!ids.length) return;
    var box = [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]];
    var feature = map.queryRenderedFeatures(box, { layers: ids })[0];
    if (popup) popup.remove();
    if (!feature) {
      selected = null;
    } else {
      var props = Object.assign({}, feature.properties);
      var layerName = props.__layer;
      var id = props.__id;
      delete props.__layer;
      delete props.__id;
      selected = { layer: layerName, geometry: feature.geometry && feature.geometry.type, id: id, properties: props };
      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat).setText(layerName).addTo(map);
    }
    renderFeature();
    shareContext();
  }

  $('opt-outline').addEventListener('change', function() {
    if (map && map.getLayer('mvt-outline')) map.setLayoutProperty('mvt-outline', 'visibility', $('opt-outline').checked ? 'visible' : 'none');
  });
  $('opt-basemap').addEventListener('change', function() {
    if (!map) return;
    if ($('opt-basemap').checked && !TOKEN) showError('The base map needs a public token for this account.');
    styleReady = false;
    layerIds = [];
    map.setStyle(styleFor($('opt-basemap').checked));
  });

  // --- Model context -------------------------------------------------------------
  // What the file holds, as background context while the viewer is open.
  var shareTimer = null;
  var lastShared = '';

  function modelContext() {
    var structured = {
      note: 'A Mapbox Vector Tile file the user has open in the Mapbox tile viewer next to this chat. "This tile" or "this file" means it.',
      file: fileName,
      tile: tile ? tile.z + '/' + tile.x + '/' + tile.y : 'unknown',
      layers: decoded.layers.map(function(layer, index) {
        var summary = layerSummary(layer);
        return {
          name: layer.name, features: layer.features.length, geometry: summary.types,
          fields: Object.keys(summary.fields).slice(0, 40), visible: !hidden[index]
        };
      })
    };
    if (selected) {
      var props = {};
      Object.keys(selected.properties).slice(0, 40).forEach(function(k) { props[k] = clip(selected.properties[k]); });
      structured.selectedFeature = { layer: selected.layer, geometry: selected.geometry, id: selected.id, properties: props };
    }
    return { content: [], structuredContent: structured };
  }

  function shareContext() {
    if (!canUpdateModelContext || !decoded || displayMode === 'inline') return;
    var context = modelContext();
    var key = JSON.stringify(context);
    if (key === lastShared) return;
    lastShared = key;
    request('ui/update-model-context', context, 10000).catch(function() { lastShared = ''; });
  }

  function scheduleShareContext() {
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(shareContext, 400);
  }
})();
</script>
</body>
</html>`;
}
